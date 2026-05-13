// EduMind Go Agent调度网关
// 核心架构：goroutine + channel 实现多Agent并发协作
// 替代C++并行栈，代码更简洁、并发更安全

package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// ===== Agent 类型定义 =====

type AgentType string

const (
	Diagnostician AgentType = "diagnostician"
	Tutor         AgentType = "tutor"
	Planner       AgentType = "planner"
	Evaluator     AgentType = "evaluator"
)

type AgentStatus string

const (
	Idle      AgentStatus = "idle"
	Running   AgentStatus = "running"
	Completed AgentStatus = "completed"
	Error     AgentStatus = "error"
)

// ===== 消息结构 =====

type AgentMessage struct {
	ID        string                 `json:"id"`
	Agent     AgentType              `json:"agent"`
	Content   string                 `json:"content"`
	Timestamp int64                  `json:"timestamp"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
}

type WSMessage struct {
	Type      string      `json:"type"`
	Payload   interface{} `json:"payload"`
	Timestamp int64       `json:"timestamp"`
}

// ===== Agent 状态 =====

type AgentState struct {
	Type        AgentType   `json:"type"`
	Name        string      `json:"name"`
	Status      AgentStatus `json:"status"`
	Icon        string      `json:"icon"`
	Color       string      `json:"color"`
	Description string      `json:"description"`
	LastActive  int64       `json:"lastActive"`
	TaskCount   int         `json:"taskCount"`
}

// ===== Agent 任务 =====

type AgentTask struct {
	ID        string
	Type      AgentType
	UserID    string
	Input     map[string]interface{}
	Result    chan TaskResult
	CreatedAt time.Time
}

type TaskResult struct {
	Success bool
	Data    interface{}
	Error   string
}

// ===== 教学状态机 =====

type TeachingPhase string

const (
	PhaseIntro      TeachingPhase = "intro"
	PhaseDefinition TeachingPhase = "definition"
	PhaseExample    TeachingPhase = "example"
	PhasePractice   TeachingPhase = "practice"
	PhaseSummary    TeachingPhase = "summary"
)

type UserIntent string

const (
	IntentWantDefinition UserIntent = "want_definition"
	IntentWantExample    UserIntent = "want_example"
	IntentContinue       UserIntent = "continue"
	IntentConfused       UserIntent = "confused"
	IntentStudentAnswer  UserIntent = "student_answer"
	IntentGreeting       UserIntent = "greeting"
	IntentUnknown        UserIntent = "unknown"
)

type TeachingStep struct {
	Phase         TeachingPhase `json:"phase"`
	Content       string        `json:"content"`
	SocraticProbe string        `json:"socraticProbe,omitempty"`
}

type DialogState struct {
	UserID         string        `json:"userId"`
	KnowledgePoint string        `json:"knowledgePoint"`
	CurrentPhase   TeachingPhase `json:"currentPhase"`
	StepIndex      int           `json:"stepIndex"`
	History        []string      `json:"history"`
	StartedAt      time.Time     `json:"startedAt"`
	LastActiveAt   time.Time     `json:"lastActiveAt"`
}

type DiagnosisRequest struct {
	UserID  string                   `json:"userId" binding:"required"`
	Answers []map[string]interface{} `json:"answers"`
}

type TeachingRequest struct {
	UserID         string `json:"userId" binding:"required"`
	Message        string `json:"message" binding:"required"`
	KnowledgePoint string `json:"knowledgePoint"`
}

type PathRequest struct {
	UserID    string                 `json:"userId" binding:"required"`
	Diagnosis map[string]interface{} `json:"diagnosis"`
}

type ReportRequest struct {
	UserID string                 `json:"userId" binding:"required"`
	Input  map[string]interface{} `json:"input"`
}

type ChainRequest struct {
	UserID string                 `json:"userId" binding:"required"`
	Input  map[string]interface{} `json:"input"`
}

type WSClient struct {
	Conn *websocket.Conn
	mu   sync.Mutex
}

func (c *WSClient) WriteJSON(v interface{}) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.Conn.WriteJSON(v)
}

func (c *WSClient) Close() error {
	return c.Conn.Close()
}

type RateLimiter struct {
	visitors map[string]*visitorInfo
	mu       sync.RWMutex
	limit    int
	window   time.Duration
}

type visitorInfo struct {
	count   int
	resetAt time.Time
}

func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	rl := &RateLimiter{
		visitors: make(map[string]*visitorInfo),
		limit:    limit,
		window:   window,
	}
	go rl.cleanupLoop()
	return rl
}

func (rl *RateLimiter) Allow(key string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	info, exists := rl.visitors[key]
	if !exists || now.After(info.resetAt) {
		rl.visitors[key] = &visitorInfo{count: 1, resetAt: now.Add(rl.window)}
		return true
	}

	if info.count >= rl.limit {
		return false
	}

	info.count++
	return true
}

func (rl *RateLimiter) cleanupLoop() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		rl.mu.Lock()
		now := time.Now()
		for key, info := range rl.visitors {
			if now.After(info.resetAt) {
				delete(rl.visitors, key)
			}
		}
		rl.mu.Unlock()
	}
}

var allowedOrigins []string

func initAllowedOrigins() {
	envOrigins := os.Getenv("ALLOWED_ORIGINS")
	if envOrigins != "" {
		allowedOrigins = strings.Split(envOrigins, ",")
	} else {
		allowedOrigins = []string{
			"http://localhost:3000",
			"http://localhost:5173",
			"http://127.0.0.1:3000",
			"http://127.0.0.1:5173",
		}
	}
}

func isOriginAllowed(origin string) bool {
	if len(allowedOrigins) == 0 {
		return true
	}
	for _, allowed := range allowedOrigins {
		if origin == allowed {
			return true
		}
	}
	parsed, err := url.Parse(origin)
	if err != nil {
		return false
	}
	if parsed.Hostname() == "localhost" || parsed.Hostname() == "127.0.0.1" {
		return true
	}
	return false
}

const (
	maxMessageLength   = 2000
	maxHistorySize     = 20
	dialogStateTTL     = 2 * time.Hour
	contextStoreTTL    = 1 * time.Hour
	wsPongWait         = 60 * time.Second
	wsPingPeriod       = (wsPongWait * 9) / 10
	wsMaxMessageSize   = 4096
	maxRequestBodySize = 1024 * 1024
)

// ===== Agent 调度器（核心）=====
// 使用 goroutine + channel 实现轻量并发

type contextEntry struct {
	data      map[string]interface{}
	createdAt time.Time
}

type AgentOrchestrator struct {
	agents map[AgentType]*AgentState
	mu     sync.RWMutex

	taskQueues map[AgentType]chan AgentTask

	broadcast chan WSMessage

	wsClients map[*WSClient]bool
	wsMu      sync.RWMutex

	contextStore map[string]*contextEntry
	ctxMu        sync.RWMutex

	dialogStates map[string]*DialogState
	dialogMu     sync.RWMutex

	rateLimiter  *RateLimiter
	requestCount atomic.Int64
}

// NewAgentOrchestrator 创建调度器
func NewAgentOrchestrator() *AgentOrchestrator {
	return &AgentOrchestrator{
		agents: map[AgentType]*AgentState{
			Diagnostician: {
				Type:        Diagnostician,
				Name:        "诊断Agent",
				Status:      Idle,
				Icon:        "agent-diagnosis.png",
				Color:       "#4f46e5",
				Description: "认知诊断与薄弱点识别",
			},
			Tutor: {
				Type:        Tutor,
				Name:        "教学Agent",
				Status:      Idle,
				Icon:        "agent-tutor.png",
				Color:       "#10b981",
				Description: "Socratic对话式教学",
			},
			Planner: {
				Type:        Planner,
				Name:        "规划Agent",
				Status:      Idle,
				Icon:        "agent-planner.png",
				Color:       "#f59e0b",
				Description: "个性化学习路径生成",
			},
			Evaluator: {
				Type:        Evaluator,
				Name:        "评估Agent",
				Status:      Idle,
				Icon:        "agent-evaluator.png",
				Color:       "#ec4899",
				Description: "学习进度与效果评估",
			},
		},
		taskQueues: map[AgentType]chan AgentTask{
			Diagnostician: make(chan AgentTask, 100),
			Tutor:         make(chan AgentTask, 100),
			Planner:       make(chan AgentTask, 100),
			Evaluator:     make(chan AgentTask, 100),
		},
		broadcast:    make(chan WSMessage, 256),
		wsClients:    make(map[*WSClient]bool),
		contextStore: make(map[string]*contextEntry),
		dialogStates: make(map[string]*DialogState),
		rateLimiter:  NewRateLimiter(60, time.Minute),
	}
}

// Start 启动所有Agent工作goroutine
func (o *AgentOrchestrator) Start() {
	go o.agentWorker(Diagnostician, o.handleDiagnosis)
	go o.agentWorker(Tutor, o.handleTeaching)
	go o.agentWorker(Planner, o.handlePlanning)
	go o.agentWorker(Evaluator, o.handleEvaluation)

	go o.broadcastWorker()
	go o.cleanupStaleStates()

	log.Println("Agent调度器已启动，4个Agent工作goroutine运行中")
}

// agentWorker Agent工作goroutine
// 每个Agent独占一个goroutine，从各自的channel接收任务
func (o *AgentOrchestrator) agentWorker(agentType AgentType, handler func(AgentTask) TaskResult) {
	log.Printf("[%s] Agent工作goroutine启动\n", agentType)

	for task := range o.taskQueues[agentType] {
		o.updateAgentStatus(agentType, Running)

		time.Sleep(time.Duration(500+rand.Intn(1500)) * time.Millisecond)

		var result TaskResult
		func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("[%s] panic recovered: %v", agentType, r)
					result = TaskResult{Success: false, Error: fmt.Sprintf("内部处理错误: %v", r)}
				}
			}()
			result = handler(task)
		}()

		task.Result <- result

		o.updateAgentStatus(agentType, Idle)
		o.incrementTaskCount(agentType)

		if result.Success {
			o.broadcast <- WSMessage{
				Type:      "agent_message",
				Payload:   result.Data,
				Timestamp: time.Now().UnixMilli(),
			}
		}
	}
}

// SubmitTask 提交任务到指定Agent的队列
func (o *AgentOrchestrator) SubmitTask(task AgentTask) chan TaskResult {
	resultChan := make(chan TaskResult, 1)
	task.Result = resultChan

	// 非阻塞发送任务到对应Agent的channel
	select {
	case o.taskQueues[task.Type] <- task:
		log.Printf("[调度器] 任务已提交到 %s: %s\n", task.Type, task.ID)
	default:
		// 队列满，直接返回错误
		go func() {
			resultChan <- TaskResult{
				Success: false,
				Error:   "Agent任务队列已满，请稍后重试",
			}
		}()
	}

	return resultChan
}

// SubmitChain 提交Agent链式任务
// 诊断Agent → 教学Agent → 规划Agent → 评估Agent
func (o *AgentOrchestrator) SubmitChain(userID string, input map[string]interface{}) chan TaskResult {
	finalResult := make(chan TaskResult, 1)

	go func() {
		// 步骤1: 诊断
		diagResult := <-o.SubmitTask(AgentTask{
			ID:     "chain_diag_" + userID,
			Type:   Diagnostician,
			UserID: userID,
			Input:  input,
		})

		if !diagResult.Success {
			finalResult <- diagResult
			return
		}

		// 将诊断结果存入上下文
		o.setContext(userID, "diagnosis", diagResult.Data)

		// 步骤2: 规划（根据诊断结果生成学习路径）
		planResult := <-o.SubmitTask(AgentTask{
			ID:     "chain_plan_" + userID,
			Type:   Planner,
			UserID: userID,
			Input: map[string]interface{}{
				"diagnosis": diagResult.Data,
			},
		})

		if !planResult.Success {
			finalResult <- planResult
			return
		}

		o.setContext(userID, "path", planResult.Data)

		// 步骤3: 评估
		evalResult := <-o.SubmitTask(AgentTask{
			ID:     "chain_eval_" + userID,
			Type:   Evaluator,
			UserID: userID,
			Input: map[string]interface{}{
				"diagnosis": diagResult.Data,
				"path":      planResult.Data,
			},
		})

		finalResult <- evalResult
	}()

	return finalResult
}

// ===== 各Agent业务逻辑 =====

func (o *AgentOrchestrator) handleDiagnosis(task AgentTask) TaskResult {
	answers, ok := task.Input["answers"].([]interface{})
	if !ok || len(answers) == 0 {
		return TaskResult{Success: false, Error: "缺少答题数据或答题数据为空"}
	}

	weakPoints := []string{}
	strongPoints := []string{}
	kpCorrect := map[string]int{}
	kpTotal := map[string]int{}

	correctCount := 0
	for _, ans := range answers {
		ansMap, ok := ans.(map[string]interface{})
		if !ok {
			continue
		}
		isCorrect, _ := ansMap["correct"].(bool)
		kp, _ := ansMap["knowledgePoint"].(string)
		if kp == "" {
			continue
		}

		kpTotal[kp]++
		if isCorrect {
			correctCount++
			kpCorrect[kp]++
		}
	}

	scores := map[string]float64{}
	for kp, total := range kpTotal {
		correct := kpCorrect[kp]
		scores[kp] = float64(correct) / float64(total) * 100
		if scores[kp] < 60 {
			if !contains(weakPoints, kp) {
				weakPoints = append(weakPoints, kp)
			}
		} else {
			if !contains(strongPoints, kp) {
				strongPoints = append(strongPoints, kp)
			}
		}
	}

	overall := "intermediate"
	if correctCount <= 2 {
		overall = "beginner"
	} else if correctCount >= 4 {
		overall = "advanced"
	}

	accuracy := 0.0
	if len(answers) > 0 {
		accuracy = float64(correctCount) / float64(len(answers))
	}

	return TaskResult{
		Success: true,
		Data: map[string]interface{}{
			"weakPoints":   weakPoints,
			"strongPoints": strongPoints,
			"overallLevel": overall,
			"detailScores": scores,
			"accuracy":     accuracy,
		},
	}
}

func (o *AgentOrchestrator) handleTeaching(task AgentTask) TaskResult {
	message, ok := task.Input["message"].(string)
	if !ok || strings.TrimSpace(message) == "" {
		return TaskResult{Success: false, Error: "缺少消息内容"}
	}

	if len([]rune(message)) > maxMessageLength {
		return TaskResult{Success: false, Error: fmt.Sprintf("消息长度超过限制（最大%d字符）", maxMessageLength)}
	}

	knowledgePoint, _ := task.Input["knowledgePoint"].(string)
	if knowledgePoint == "" {
		knowledgePoint = "limit"
	}
	userID := task.UserID

	m := strings.ToLower(strings.TrimSpace(message))
	if m == "重新开始" || m == "restart" || m == "reset" {
		o.dialogMu.Lock()
		key := o.getDialogKey(userID, knowledgePoint)
		delete(o.dialogStates, key)
		o.dialogMu.Unlock()

		state := o.getOrCreateDialogState(userID, knowledgePoint)
		steps := knowledgePhaseContent(knowledgePoint)
		response := "好的，让我们重新开始学习「" + getKnowledgePointName(knowledgePoint) + "」！\n\n"
		if len(steps) > 0 {
			response += steps[0].Content
			if steps[0].SocraticProbe != "" {
				response += "\n\n🤔 " + steps[0].SocraticProbe
			}
		}
		o.saveDialogState(state)
		return TaskResult{
			Success: true,
			Data: map[string]interface{}{
				"response":       response,
				"knowledgePoint": knowledgePoint,
				"phase":          state.CurrentPhase,
				"intent":         "restart",
				"isSocratic":     true,
			},
		}
	}

	intent := detectIntent(message)
	state := o.getOrCreateDialogState(userID, knowledgePoint)

	response := o.generatePhaseBasedResponse(state, intent, message, knowledgePhaseContent(knowledgePoint))

	state.LastActiveAt = time.Now()
	o.saveDialogState(state)

	return TaskResult{
		Success: true,
		Data: map[string]interface{}{
			"response":       response,
			"knowledgePoint": knowledgePoint,
			"phase":          state.CurrentPhase,
			"intent":         intent,
			"isSocratic":     strings.Contains(response, "？") || strings.Contains(response, "?"),
		},
	}
}

// ===== 知识图谱教学内容 =====

func knowledgePhaseContent(kp string) []TeachingStep {
	contentMap := map[string][]TeachingStep{
		"limit": {
			{Phase: PhaseIntro, Content: "极限是微积分的基石。今天我们来理解「当 x 无限趋近某个值时，f(x) 的行为」。", SocraticProbe: "你之前学过函数图像吗？能想象一下x越来越接近某一点时，函数值会怎样变化？"},
			{Phase: PhaseDefinition, Content: "【定义】设 f(x) 在 x₀ 的去心邻域内有定义。若存在常数 L，对任意 ε>0，存在 δ>0，使 0<|x-x₀|<δ 时 |f(x)-L|<ε，则称 L 为 f(x) 在 x→x₀ 时的极限。记作 lim_{x→x₀}f(x)=L。", SocraticProbe: "这个 ε-δ 定义看起来很抽象。你能用自己的话解释一下「任意小的误差」是什么意思吗？"},
			{Phase: PhaseExample, Content: "【例1】求 lim_{x→0} sin(x)/x。\n解：这是微积分中最著名的极限之一！利用夹逼定理或泰勒展开可证明其值为 1。\n几何直观：单位圆中，弧长、正弦线、切线三者的关系。", SocraticProbe: "如果题目变成 lim_{x→0} sin(2x)/x，你觉得结果会怎样？提示：可以用变量代换。"},
			{Phase: PhasePractice, Content: "【练习】请计算：lim_{x→∞} (1 + 1/x)^x\n提示：这和自然常数 e 的定义有关。想想 e ≈ 2.71828 是怎么来的？", SocraticProbe: "你算出的答案是什么？能说说你的思路吗？"},
			{Phase: PhaseSummary, Content: "【本节总结】\n① 极限描述的是一种「趋势」而非「到达」\n② 重要极限：sin(x)/x → 1 (x→0)，(1+1/x)^x → e (x→∞)\n③ 极限存在的充要条件：左右极限都存在且相等\n④ 下一步我们将学习连续性——它是极限的特殊情况（L = f(x₀)）"},
		},
		"derivative": {
			{Phase: PhaseIntro, Content: "导数是研究变化率的工具。想象你在爬山，导数就是当前位置的坡度——告诉你往上走多陡。", SocraticProbe: "如果坡度是0意味着什么？如果是负数呢？"},
			{Phase: PhaseDefinition, Content: "【定义】f'(x₀) = lim_{h→0} [f(x₀+h) - f(x₀)] / h\n几何意义：曲线 y=f(x) 在点 (x₀, f(x₀)) 处**切线的斜率**\n物理意义：瞬时速度 = 位移对时间的导数", SocraticProbe: "为什么 h 要趋近于0而不是等于0？如果h=0会发生什么？"},
			{Phase: PhaseExample, Content: "【例】求 f(x)=x³ 在 x=2 处的导数。\n解：f'(x) = 3x²（幂函数求导法则）\n所以 f'(2) = 3×4 = 12\n验证：用定义计算 [f(2+h)-f(2)]/h = [(8+12h+6h²+h³)-8]/h = 12+6h+h² → 12", SocraticProbe: "幂函数的通用求导公式 (xⁿ)' = nx^{n-1}，你能用它快速求出 x^5 的导数吗？"},
			{Phase: PhasePractice, Content: "【练习】求导：d/dx[e^x · ln(x)]\n提示：这是两个函数相乘，需要用到什么法则？", SocraticProbe: "你的答案是 e^x(1/x + ln x) 吗？乘积法则是 (uv)' = u'v + uv'，检查一下每一步"},
			{Phase: PhaseSummary, Content: "【本节总结】\n① 导数的本质是「瞬时变化率」= 差商的极限\n② 基本公式：(xⁿ)'=nx^{n-1}, (eˣ)'=eˣ, (ln x)'=1/x\n③ 运算法则：和差法则、乘积法则(uv)'=u'v+uv'、链式法则\n④ 链式法则处理复合函数，是下一节的重点"},
		},
		"chain_rule": {
			{Phase: PhaseIntro, Content: "链式法则是求复合函数导数的「万能钥匙」——几乎所有复杂函数的求导最终都要归结到它。", SocraticProbe: "你能举一个生活中「嵌套关系」的例子吗？比如穿衣服的过程？"},
			{Phase: PhaseDefinition, Content: "【链式法则】若 y=f(u), u=g(x)，则 dy/dx = dy/du · du/gx\n通俗记忆：「外层导 × 内层导」，像剥洋葱一样从外到内逐层求导\n符号写法：(f(g(x)))' = f'(g(x)) · g'(x)", SocraticProbe: "为什么是乘法关系而不是加法？想想变化率的传递——外层的变化由内层驱动"},
			{Phase: PhaseExample, Content: "【例】求 y=sin(x²) 的导数。\n步骤1：识别结构 — 外层 sin(·)，内层 x²\n步骤2：外层导 — cos(x²)\n步骤3：内层导 — 2x\n结果：y' = cos(x²) · 2x = 2x·cos(x²)", SocraticProbe: "那 y = ln(sin(x)) 呢？这次内层和外层分别是什么？"},
			{Phase: PhasePractice, Content: "【练习】求 d/dx[√(1+x²)]\n即 y=(1+x²)^{1/2}\n提示：先确定外层函数和内层函数", SocraticProbe: "答案应该是 x/√(1+x²)。对照一下：外层导是 (1/2)(1+x²)^{-1/2}，内层导是 2x"},
			{Phase: PhaseSummary, Content: "【本节总结】\n① 链式法则核心：dy/dx = (dy/du)×(du/dx)\n② 操作步骤：识别嵌套 → 外层求导 × 内层求导\n③ 多层嵌套：从最外层开始，一层一层往里剥\n④ 常见陷阱：忘记乘内层导、混淆内外层顺序"},
		},
		"indefinite_integral": {
			{Phase: PhaseIntro, Content: "不定积分是导数的逆运算。如果说导数是「拆解变化」，积分就是「累积总量」。", SocraticProbe: "已知速度函数 v(t)，怎么求位移？这就是积分的思想起源"},
			{Phase: PhaseDefinition, Content: "【定义】若 F'(x) = f(x)，则称 F 为 f 的一个原函数。全体原函数记为 ∫f(x)dx = F(x) + C\n其中 C 为任意常数（因为常数的导数为0）\n基本公式：∫xⁿdx = x^{n+1}/(n+1) + C (n≠-1)", SocraticProbe: "为什么一定要加 +C？如果不加会有什么问题？"},
			{Phase: PhaseExample, Content: "【例】求 ∫(3x² + 2x + 1)dx\n解：分项积分\n= 3·∫x²dx + 2·∫xdx + ∫1dx\n= 3·(x³/3) + 2·(x²/2) + x + C\n= x³ + x² + x + C", SocraticProbe: "验证一下：对结果求导，看看能不能回到被积函数？"},
			{Phase: PhasePractice, Content: "【练习】求 ∫(e^x + 1/x) dx\n提示：e^x 的积分是什么？1/x 的积分又是什么特殊函数？", SocraticProbe: "答案是 e^x + ln|x| + C。注意 1/x 的积分是 ln|x| 不是 ln(x)，为什么需要绝对值？"},
			{Phase: PhaseSummary, Content: "【本节总结】\n① 不定积分 = 求原函数族（带+C）\n② 基本公式：∫xⁿdx=x^{n+1}/(n+1)+C, ∫eˣdx=eˣ+C, ∫(1/x)dx=ln|x|+C\n③ 线性性质：∫[af(x)+bg(x)]dx = a∫fdx + b∫gdx\n④ 下一步学习定积分——它给积分赋予了具体的数值意义"},
		},
		"definite_integral": {
			{Phase: PhaseIntro, Content: "定积分回答的是具体问题：曲线下的面积到底有多大？不再是「一族函数」，而是一个确定的数值。", SocraticProbe: "如果让你估算一个不规则图形的面积，你会用什么方法？"},
			{Phase: PhaseDefinition, Content: "【牛顿-莱布尼茨公式】∫_a^b f(x)dx = F(b) - F(a)\n其中 F 是 f 的任一原函数\n黎曼和思想：把区域分割成 n 个小矩形，宽度 Δx=(b-a)/n，高度 f(ξᵢ)，总面积 = Σf(ξᵢ)Δx，取 n→∞ 的极限", SocraticProbe: "为什么定积分的结果是一个数而不带 +C？上下限代入后 C 会被怎样？"},
			{Phase: PhaseExample, Content: "【例】计算 ∫_0^π sin(x)dx\n解：原函数 F(x) = -cos(x)\nF(π) - F(0) = (-cosπ) - (-cos0) = (-(-1)) - (-1) = 1 + 1 = 2\n几何验证：sin(x) 在 [0,π] 上非负，面积为 2，符合直觉", SocraticProbe: "如果积分区间改成 [0, 2π]，结果会是多少？画图看看正弦曲线在两个周期内的表现"},
			{Phase: PhasePractice, Content: "【练习】计算 ∫_0^1 x²dx\n先用定义（黎曼和的极限），再用牛顿-莱布尼茨公式验证", SocraticProbe: "答案是 1/3。用两种方法做出来了吗？体会一下公式的威力"},
			{Phase: PhaseSummary, Content: "【本节总结】\n① 定积分 = 数值（面积/物理量），不定积分 = 函数族\n② 牛顿-莱布尼茨公式连接了两者：∫_a^b fdx = F(b)-F(a)\n③ 定积分性质：线性、区间可加性、保号性\n④ 下一步：换元积分法和分部积分法——处理更复杂的被积函数"},
		},
		"multiple_integral": {
			{Phase: PhaseIntro, Content: "二重积分是一元定积分向二维的自然推广。我们不再计算「曲线下方的面积」，而是计算「曲面下方曲顶柱体的体积」。", SocraticProbe: "一维积分算的是面积（二维概念），二维积分算的是体积（三维概念）。这个规律继续下去会怎样？"},
			{Phase: PhaseDefinition, Content: "【定义】∬_D f(x,y)dσ = lim_{λ→0} Σf(ξᵢ,ηᵢ)Δσᵢ\n其中 D 是 xy 平面上的有界闭区域，dσ 是面积元素\n累次积分（Fubini 定理）：∬_D fdσ = ∫[∫f(x,y)dx]dy = ∫[∫f(x,y)dy]dx\n矩形区域 D=[a,b]×[c,d]：∬_D fdσ = ∫_a^b dx ∫_c^d f(x,y)dy", SocraticProbe: "累次积分可以交换次序吗？什么条件下可以？这叫什么定理？"},
			{Phase: PhaseExample, Content: "【例】计算 ∬_D (x+y)dσ，D=[0,1]×[0,1]\n解：∬_D (x+y)dσ = ∫_0^1 dx ∫_0^1 (x+y)dy\n先对y积分：∫_0^1 (x+y)dy = [xy + y²/2]_0^1 = x + 1/2\n再对x积分：∫_0^1 (x + 1/2)dx = [x²/2 + x/2]_0^1 = 1/2 + 1/2 = 1", SocraticProbe: "如果交换积分次序，先x后y，结果会变吗？试一下验证 Fubini 定理"},
			{Phase: PhasePractice, Content: "【练习】计算 ∬_D x²y dσ，其中 D=[0,2]×[1,3]\n第一步应该先对哪个变量积分？有没有偏好？", SocraticProbe: "答案是 16。计算过程：∫_0^2 x²dx · ∫_1^3 ydy = [8/3] · [4] = 32/3... 等等，再仔细算一遍？"},
			{Phase: PhaseSummary, Content: "【本节总结】\n① 二重积分 = 曲顶柱体体积，累次积分是计算工具\n② Fubini 定理：在矩形域上积分次序可交换\n③ 积分次序选择技巧：看哪个变量的积分更简单\n④ 极坐标变换：x=r cosθ, y=r sinθ, dσ=r dr dθ（用于圆形区域）"},
		},
		"series": {
			{Phase: PhaseIntro, Content: "级数是「无穷多项之和」的概念。看似简单，却蕴含着数学史上一些最美妙的发现——比如欧拉解决巴塞尔问题的故事。", SocraticProbe: "无穷多个正数相加，结果一定是无穷大吗？想一想 1 + 1/2 + 1/4 + 1/8 + ... ？"},
			{Phase: PhaseDefinition, Content: "【p-级数】Σ_{n=1}^∞ 1/n^p\n- p > 1 时收敛（如 p=2 时 Σ1/n² = π²/6，欧拉1735年证明）\n- p ≤ 1 时发散（如调和级数 Σ1/n 发散到 +∞）\n比值判别法：若 lim|a_{n+1}/a_n| = L < 1 则收敛；L > 1 则发散", SocraticProbe: "调和级数 Σ1/n 发散这件事违反直觉——通项趋于0但和却是无穷大。你怎么理解这个矛盾？"},
			{Phase: PhaseExample, Content: "【例】判断 Σ_{n=1}^∞ 1/n² 的敛散性\n这是 p=2 的p级数，p>1，故收敛。\n欧拉的惊人发现：Σ1/n² = π²/6 ≈ 1.644934...\n证明思路涉及傅里叶级数展开或复分析方法", SocraticProbe: "为什么结果是 π²/6 而不是别的常数？这暗示了自然数与圆周率之间有深刻的联系"},
			{Phase: PhasePractice, Content: "【练习】判断以下级数的敛散性：Σ_{n=1}^∞ n/2^n\n提示：试试比值判别法，计算 a_{n+1}/a_n 的极限", SocraticProbe: "极限是 1/2 < 1，所以收敛。比值判别法的直观含义是什么？"},
			{Phase: PhaseSummary, Content: "【本节总结】\n① 级数敛散性的核心判别法：比较判别法、比值判别法、根值判别法\n② 重要结论：p级数在 p>1 收敛，调和级数(p=1)发散\n③ 幂级数 Σaₙ(x-x₀)ⁿ 有收敛半径 R\n④ 泰勒级数将函数展开为无穷多项之和：e^x = Σxⁿ/n!"},
		},
		"ode": {
			{Phase: PhaseIntro, Content: "微分方程是含未知函数及其导数的方程。它是数学建模的核心工具——从人口增长到热传导，从电路分析到传染病模型。", SocraticProbe: "你能想到哪些日常现象可以用微分方程来描述？"},
			{Phase: PhaseDefinition, Content: "【一阶线性齐次 ODE】y' + P(x)y = 0\n通解：y = Ce^{-∫P(x)dx}\n分离变量法：dy/y = -P(x)dx → 两边积分\n【一阶线性非齐次】y' + P(x)y = Q(x)\n通解：y = e^{-∫Pdx}[∫Q·e^{∫Pdx}dx + C] （常数变易法）", SocraticProbe: "为什么齐次方程的解只有一个任意常数C？这与方程的阶数有什么关系？"},
			{Phase: PhaseExample, Content: "【例】求解 y' = ky（指数增长/衰减模型）\ndy/dt = ky → dy/y = kdt → ln|y| = kt + C₁ → y = Ce^{kt}\n应用：k>0 为指数增长（如细菌繁殖），k<0 为指数衰减（如放射性衰变）", SocraticProbe: "如果初始条件 y(0) = y₀，那么 C 应该取多少？半衰期如何从这个公式推导？"},
			{Phase: PhasePractice, Content: "【练习】求解初值问题：y' + 2xy = x，y(0) = 1\n这是一阶线性非齐次方程，先求积分因子 μ(x) = e^{∫2xdx}", SocraticProbe: "通解是 y = 1/2 + (1/2)e^{-x²}。代入初始条件验证一下"},
			{Phase: PhaseSummary, Content: "【本节总结】\n① 一阶ODE的基本解法：分离变量法、积分因子法、常数变易法\n② 解的结构：通解 = 齐次通解 + 特解\n③ 常见模型：指数增长/衰减、冷却定律、 logistic 增长\n④ 二阶ODE（下一阶）：特征方程法，涉及振动和波动现象"},
		},
		"partial_derivative": {
			{Phase: PhaseIntro, Content: "偏导数处理的是多元函数——当一个函数依赖多个变量时，我们如何衡量它在每个方向上的变化率？", SocraticProbe: "如果你站在山坡上，朝不同方向走，坡度可能完全一样也可能不同。偏导数就是固定方向测量的坡度"},
			{Phase: PhaseDefinition, Content: "【定义】∂f/∂x = lim_{h→0} [f(x+h,y) - f(x,y)] / h\n关键：对 x 求偏导时，将 y 视为**常数**\n二阶偏导：∂²f/∂x², ∂²f/∂y∂x（混合偏导）\nClairaut 定理：若混合偏导连续，则 ∂²f/∂x∂y = ∂²f/∂y∂x", SocraticProbe: "Clairaut 定理说明求导顺序不影响结果。这在物理上有什么对应的意义？"},
			{Phase: PhaseExample, Content: "【例】f(x,y) = x²y + y³，求 ∂f/∂x 和 ∂f/∂y\n∂f/∂x = 2x（y 视为常数，y³ 的导数为 0）\n∂f/∂y = x² + 3y²（x 视为常数，x²y 对 y 求导得 x²）", SocraticProbe: "那 ∂²f/∂x∂y 呢？先对 x 再对 y，或者反过来，结果相同吗？"},
			{Phase: PhasePractice, Content: "【练习】f(x,y) = e^(xy) + sin(x+y)\n求 ∂f/∂x, ∂f/∂y, 以及 ∂²f/∂x∂y\n提示：e^(xy) 对 x 求偏导要用到链式法则思想", SocraticProbe: "∂f/∂x = ye^(xy) + cos(x+y)，∂f/∂y = xe^(xy) + cos(x+y)。混合偏导呢？"},
			{Phase: PhaseSummary, Content: "【本节总结】\n① 偏导数 = 固定其他变量，对一个变量求导\n② 记号 ∂（round d）区别于普通导数 d\n③ Clairaut 定理：连续混合偏导与求导顺序无关\n④ 应用：梯度向量 ∇f = (∂f/∂x, ∂f/∂y) 指向最快上升方向"},
		},
		"continuity": {
			{Phase: PhaseIntro, Content: "连续性是我们直觉上「不断开」的数学精确化。一个连续函数的图像是可以一笔画成的。", SocraticProbe: "哪些函数是不连续的？想想分段函数或者有跳跃点的函数"},
			{Phase: PhaseDefinition, Content: "【连续的三要素】\n① f(x₀) 有定义（点存在）\n② lim_{x→x₀} f(x) 存在（极限存在）\n③ lim_{x→x₀} f(x) = f(x₀)（极限值 = 函数值）\n三者缺一不可！", SocraticProbe: "如果只满足前两条但不满足第三条，这种间断叫什么类型？"},
			{Phase: PhaseExample, Content: "【例1】f(x) = (x²-1)/(x-1) 在 x=1 处\n化简：f(x) = (x+1)(x-1)/(x-1) = x+1 (x≠1)\nf(1) 无定义 → 不满足条件① → **可去间断点**\n补充定义 f(1)=2 后即可连续\n\n【例2】sgn(x)（符号函数）在 x=0 → 左右极限不等 → **跳跃间断点**", SocraticProbe: "第三类间断点是什么？提示：振荡型，比如 sin(1/x) 在 x→0 时"},
			{Phase: PhasePractice, Content: "【练习】讨论 f(x) = x·sin(1/x) (x≠0), f(0)=0 在 x=0 处的连续性\n提示：用夹逼定理判断极限是否存在", SocraticProbe: "|x·sin(1/x)| ≤ |x| → 0，所以极限存在且等于 f(0)=0。这是一个连续但不可导的经典例子"},
			{Phase: PhaseSummary, Content: "【本节总结】\n① 连续三要素：有定义、有极限、极限值=函数值\n② 间断点分类：可去（补定义）、跳跃（左右极限不等）、振荡（极限不存在）\n③ 连续函数的性质：介值定理、最值定理\n④ 连续 ⇒ 可导？不！连续只是可导的必要条件"},
		},
		"integration_by_parts": {
			{Phase: PhaseIntro, Content: "分部积分法是积分版的「乘积法则」。当你遇到两个不同类型函数相乘的积分时，它是最有力的武器。", SocraticProbe: "乘积法则是 (uv)' = u'v + uv'。如果把求导换成积分，你会得到什么？"},
			{Phase: PhaseDefinition, Content: "【分部积分公式】∫u dv = uv - ∫v du\n由 (uv)' = u'v + uv' 两边积分得到\n选 u 的原则（LIATE 法则）：\nL: 对数函数 < I: 反三角函数 < A: 代数函数 < T: 三角函数 < E: 指数函数\n排在前面的优先选作 u", SocraticProbe: "为什么 LIATE 这个顺序有效？想一想哪类函数求导后会简化，哪类不会"},
			{Phase: PhaseExample, Content: "【例】∫x·e^x dx\n按 LIATE：A(代数 x) 排在 E(指数 e^x) 前 → u=x, dv=e^x dx\n则 du=dx, v=e^x\n∫x·e^x dx = x·e^x - ∫e^x dx = x·e^x - e^x + C = e^x(x-1) + C", SocraticProbe: "如果题目是 ∫x²·e^x dx 呢？需要多次分部积分"},
			{Phase: PhasePractice, Content: "【练习】∫ln(x) dx\n这题没有明显的乘积形式，怎么办？提示：可以把 ln(x) 看作 ln(x)·1", SocraticProbe: "u=ln(x), dv=dx → du=(1/x)dx, v=x → 结果 = x·ln(x) - x + C"},
			{Phase: PhaseSummary, Content: "【本节总结】\n① 分部积分 = ∫udv = uv - ∫v du（积分版乘积法则）\n② LIATE 选 u 原则：对数 > 反三角 > 代数 > 三角 > 指数\n③ 循环型：∫e^x sinx dx 需要两次分部积分后解方程\n④ 与换元法配合使用处理复杂积分"},
		},
		"taylor": {
			{Phase: PhaseIntro, Content: "泰勒公式是微积分的「万能近似器」——它告诉我们任何光滑函数都可以用多项式来逼近。这是整个现代科学计算的数学基础。", SocraticProbe: "为什么多项式这么好用？计算机最容易计算的是什么类型的表达式？"},
			{Phase: PhaseDefinition, Content: "【泰勒展开】f(x) = Σ_{n=0}^∞ [f⁽ⁿ⁾(a)/n!] (x-a)ⁿ\n= f(a) + f'(a)(x-a) + f''(a)(x-a)²/2! + f'''(a)(x-a)³/3! + ...\n麦克劳林展开（a=0）：f(x) = f(0) + f'(0)x + f''(0)x²/2! + ...\n余项：Rₙ(x) = f⁽ⁿ⁺¹⁾(ξ)(x-a)ⁿ⁺¹/(n+1)!（拉格朗日型）", SocraticProbe: "n 越大，近似精度越高。但什么时候泰勒级数就「精确等于」原函数了？"},
			{Phase: PhaseExample, Content: "【例】e^x 的麦克劳林展开\ne^x = 1 + x + x²/2! + x³/3! + x⁴/4! + ...\n因为 e^x 的任意阶导数都是 e^x，在 x=0 处都等于 1\n验证：e¹ = 1+1+1/2+1/6+1/24+... ≈ 2.71828... ✓", SocraticProbe: "sin(x) 的展开只有奇数次项，cos(x) 只有偶数次项。为什么呢？"},
			{Phase: PhasePractice, Content: "【练习】写出 ln(1+x) 在 x=0 处的前 4 项麦克劳林展开\n提示：先计算 f(0), f'(0), f''(0), f'''(0)", SocraticProbe: "ln(1+x) = x - x²/2 + x³/3 - x⁴/4 + ... 注意交错级数的特点，收敛半径是多少？"},
			{Phase: PhaseSummary, Content: "【本节总结】\n① 泰勒公式 = 用多项式逼近光滑函数\n② 常见展开：e^x=Σxⁿ/n!, sinx=Σ(-1)ⁿx^{2n+1}/(2n+1)!, cosx=Σ(-1)ⁿx^{2n}/(2n)!\n③ 应用：近似计算、极限求解、方程求根\n④ 收敛半径决定了展开式的有效范围"},
		},
	}

	if steps, ok := contentMap[kp]; ok {
		return steps
	}

	return defaultTeachingSteps()
}

func defaultTeachingSteps() []TeachingStep {
	return []TeachingStep{
		{Phase: PhaseIntro, Content: "欢迎来到本节课程！让我们一步步深入理解这个知识点。", SocraticProbe: "你对这个话题有多少了解？我们可以从你最熟悉的部分开始"},
		{Phase: PhaseDefinition, Content: "这里是该知识点的正式定义和核心概念...", SocraticProbe: "你能用自己的话复述一下这个定义的关键部分吗？"},
		{Phase: PhaseExample, Content: "下面我们通过具体例子来理解...", SocraticProbe: "这个例子的解题思路是什么？关键步骤在哪里？"},
		{Phase: PhasePractice, Content: "现在轮到你来尝试了...", SocraticProbe: "你的思路是什么？大胆说出来，我们一起探讨"},
		{Phase: PhaseSummary, Content: "本节课我们学习了...", SocraticProbe: "你觉得最难理解的部分是什么？我们可以在下次课重点复习"},
	}
}

func (o *AgentOrchestrator) handlePlanning(task AgentTask) TaskResult {
	// 根据诊断结果生成学习路径
	diagnosis, ok := task.Input["diagnosis"].(map[string]interface{})
	if !ok {
		// 生成默认路径
		return o.generateDefaultPath()
	}

	weakPoints, ok := diagnosis["weakPoints"].([]interface{})
	if !ok || len(weakPoints) == 0 {
		return o.generateDefaultPath()
	}

	// 生成针对性路径
	path := []map[string]interface{}{}
	order := 1
	for _, wp := range weakPoints {
		path = append(path, map[string]interface{}{
			"knowledgePointId": wp,
			"order":            order,
			"estimatedTime":    30 + rand.Intn(30),
			"status":           "available",
		})
		order++
	}

	return TaskResult{
		Success: true,
		Data: map[string]interface{}{
			"nodes":         path,
			"estimatedTime": order * 30,
		},
	}
}

func (o *AgentOrchestrator) handleEvaluation(task AgentTask) TaskResult {
	// 综合分析生成评估报告
	userID := task.UserID
	_ = userID

	return TaskResult{
		Success: true,
		Data: map[string]interface{}{
			"overallScore":      75 + rand.Intn(20),
			"questionsAnswered": 50 + rand.Intn(50),
			"accuracy":          0.7 + float64(rand.Intn(25))/100,
			"timeSpent":         120 + rand.Intn(200),
			"masteryLevel":      0.6 + float64(rand.Intn(35))/100,
			"suggestions": []string{
				"建议加强极限与连续的基础概念练习",
				"导数应用部分掌握良好，可继续深入学习",
				"级数理论需要更多练习，建议观看相关视频讲解",
			},
		},
	}
}

func (o *AgentOrchestrator) generateDefaultPath() TaskResult {
	defaultPath := []map[string]interface{}{
		{"knowledgePointId": "limit", "order": 1, "estimatedTime": 30, "status": "available"},
		{"knowledgePointId": "continuity", "order": 2, "estimatedTime": 25, "status": "locked"},
		{"knowledgePointId": "derivative", "order": 3, "estimatedTime": 35, "status": "locked"},
		{"knowledgePointId": "chain_rule", "order": 4, "estimatedTime": 30, "status": "locked"},
		{"knowledgePointId": "indefinite_integral", "order": 5, "estimatedTime": 40, "status": "locked"},
		{"knowledgePointId": "definite_integral", "order": 6, "estimatedTime": 35, "status": "locked"},
	}

	return TaskResult{
		Success: true,
		Data: map[string]interface{}{
			"nodes":         defaultPath,
			"estimatedTime": 195,
		},
	}
}

// ===== 状态管理 =====

func (o *AgentOrchestrator) updateAgentStatus(agentType AgentType, status AgentStatus) {
	o.mu.Lock()
	defer o.mu.Unlock()

	if agent, ok := o.agents[agentType]; ok {
		agent.Status = status
		agent.LastActive = time.Now().UnixMilli()
	}
}

func (o *AgentOrchestrator) incrementTaskCount(agentType AgentType) {
	o.mu.Lock()
	defer o.mu.Unlock()

	if agent, ok := o.agents[agentType]; ok {
		agent.TaskCount++
	}
}

func (o *AgentOrchestrator) GetAgentStates() []AgentState {
	o.mu.RLock()
	defer o.mu.RUnlock()

	states := []AgentState{}
	for _, agent := range o.agents {
		states = append(states, *agent)
	}
	return states
}

// ===== 上下文管理 =====

func (o *AgentOrchestrator) setContext(userID string, key string, value interface{}) {
	o.ctxMu.Lock()
	defer o.ctxMu.Unlock()

	if o.contextStore[userID] == nil {
		o.contextStore[userID] = &contextEntry{data: make(map[string]interface{}), createdAt: time.Now()}
	}
	o.contextStore[userID].data[key] = value
}

func (o *AgentOrchestrator) getContext(userID string, key string) (interface{}, bool) {
	o.ctxMu.RLock()
	defer o.ctxMu.RUnlock()

	if entry, ok := o.contextStore[userID]; ok {
		val, exists := entry.data[key]
		return val, exists
	}
	return nil, false
}

// ===== WebSocket 广播 =====

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true
		}
		return isOriginAllowed(origin)
	},
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
}

func (o *AgentOrchestrator) broadcastWorker() {
	for msg := range o.broadcast {
		o.wsMu.RLock()
		clients := make([]*WSClient, 0, len(o.wsClients))
		for client := range o.wsClients {
			clients = append(clients, client)
		}
		o.wsMu.RUnlock()

		for _, client := range clients {
			if err := client.WriteJSON(msg); err != nil {
				o.wsMu.Lock()
				delete(o.wsClients, client)
				o.wsMu.Unlock()
				client.Close()
			}
		}
	}
}

func (o *AgentOrchestrator) handleWebSocket(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Println("WebSocket升级失败:", err)
		return
	}

	client := &WSClient{Conn: conn}

	o.wsMu.Lock()
	o.wsClients[client] = true
	o.wsMu.Unlock()

	states := o.GetAgentStates()
	client.WriteJSON(WSMessage{
		Type:      "agent_status",
		Payload:   states,
		Timestamp: time.Now().UnixMilli(),
	})

	conn.SetReadLimit(wsMaxMessageSize)
	conn.SetReadDeadline(time.Now().Add(wsPongWait))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(wsPongWait))
		return nil
	})

	done := make(chan struct{})
	go func() {
		ticker := time.NewTicker(wsPingPeriod)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				client.mu.Lock()
				err := conn.WriteMessage(websocket.PingMessage, nil)
				client.mu.Unlock()
				if err != nil {
					return
				}
			case <-done:
				return
			}
		}
	}()

	defer func() {
		close(done)
		client.Close()
		o.wsMu.Lock()
		delete(o.wsClients, client)
		o.wsMu.Unlock()
	}()

	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			break
		}
	}
}

// ===== 意图识别 =====

func detectIntent(message string) UserIntent {
	m := strings.ToLower(strings.TrimSpace(message))

	keywords := map[UserIntent][]string{
		IntentWantDefinition: {"定义", "什么是", "概念", "介绍一下", "meaning", "definition", "explain", "解释"},
		IntentWantExample:    {"例子", "怎么算", "演示", "举个例子", "example", "show me", "具体"},
		IntentContinue:       {"继续", "下一步", "然后呢", "懂了", "明白了", "ok", "next", "继续说", "go on", "yes", "好"},
		IntentConfused:       {"为什么", "怎么回事", "不理解", "不懂", "没懂", "why", "confused", "不明白", "不清楚", "困惑"},
		IntentStudentAnswer:  {"答案是", "结果是", "我认为", "我觉得是", "应该是", "my answer", "等于"},
		IntentGreeting:       {"你好", "hi", "hello", "开始", "start"},
	}

	matched := IntentUnknown
	maxMatches := 0

	for intent, words := range keywords {
		count := 0
		for _, word := range words {
			if strings.Contains(m, word) {
				count++
			}
		}
		if count > maxMatches && count > 0 {
			maxMatches = count
			matched = intent
		}
	}

	if matched == IntentUnknown {
		if len([]rune(m)) <= 4 {
			return IntentContinue
		}
		return IntentStudentAnswer
	}

	return matched
}

// ===== 对话状态管理 =====

func (o *AgentOrchestrator) getDialogKey(userID, knowledgePoint string) string {
	return userID + ":" + knowledgePoint
}

func (o *AgentOrchestrator) getOrCreateDialogState(userID, knowledgePoint string) *DialogState {
	key := o.getDialogKey(userID, knowledgePoint)

	o.dialogMu.RLock()
	if state, ok := o.dialogStates[key]; ok {
		o.dialogMu.RUnlock()
		return state
	}
	o.dialogMu.RUnlock()

	o.dialogMu.Lock()
	defer o.dialogMu.Unlock()

	if state, ok := o.dialogStates[key]; ok {
		return state
	}

	state := &DialogState{
		UserID:         userID,
		KnowledgePoint: knowledgePoint,
		CurrentPhase:   PhaseIntro,
		StepIndex:      0,
		History:        []string{},
		StartedAt:      time.Now(),
	}
	o.dialogStates[key] = state
	return state
}

func (o *AgentOrchestrator) saveDialogState(state *DialogState) {
	key := o.getDialogKey(state.UserID, state.KnowledgePoint)
	o.dialogMu.Lock()
	defer o.dialogMu.Unlock()
	o.dialogStates[key] = state
}

// ===== 阶段式教学响应生成 =====

func (o *AgentOrchestrator) generatePhaseBasedResponse(state *DialogState, intent UserIntent, message string, steps []TeachingStep) string {
	state.History = append(state.History, message)
	if len(state.History) > 20 {
		state.History = state.History[len(state.History)-20:]
	}

	switch intent {
	case IntentConfused:
		return o.handleConfused(state, steps)

	case IntentWantDefinition:
		return o.handleWantDefinition(state, steps)

	case IntentWantExample:
		return o.handleWantExample(state, steps)

	case IntentContinue:
		return o.handleContinue(state, steps)

	case IntentStudentAnswer:
		return o.handleStudentAnswer(state, message, steps)

	case IntentGreeting:
		return "你好！我是你的AI数学导师 🎓 今天我们一起来学习「" + getKnowledgePointName(state.KnowledgePoint) + "」。准备好了吗？输入「开始」或「继续」即可！"

	default:
		return o.handleDefault(state, message, steps)
	}
}

func (o *AgentOrchestrator) handleConfused(state *DialogState, steps []TeachingStep) string {
	currentStep := o.getCurrentStep(steps, state)
	if currentStep == nil {
		return "抱歉，当前没有可用的教学内容。输入「重新开始」重置学习进度。"
	}
	switch state.CurrentPhase {
	case PhaseIntro:
		return "没关系，我们从头来。" + currentStep.Content + "\n\n💡 " + currentStep.SocraticProbe
	case PhaseDefinition:
		return "定义确实比较抽象，让我换个方式解释：\n\n" + simplifyDefinition(currentStep.Content) + "\n\n关键就一句话：" + extractCoreIdea(currentStep.Content) + "\n\n" + currentStep.SocraticProbe
	case PhaseExample:
		return "这个例子的思路确实需要仔细理解。让我拆解一下：\n\n" + breakDownExample(currentStep.Content) + "\n\n哪一步不太清楚？可以告诉我"
	case PhasePractice:
		return "练习有难度很正常！给个提示：\n\n" + givePracticeHint(currentStep.Content) + "\n\n再试一次？或者我可以展示完整解答过程"
	case PhaseSummary:
		return "总结部分我帮你梳理一下重点：\n\n" + summarizeKeyPoints(currentStep.Content) + "\n\n还有哪里想深入讨论的吗？"
	default:
		return currentStep.Content + "\n\n" + currentStep.SocraticProbe
	}
}

func (o *AgentOrchestrator) handleWantDefinition(state *DialogState, steps []TeachingStep) string {
	defStep := findStepByPhase(steps, PhaseDefinition)
	if defStep != nil {
		state.CurrentPhase = PhaseDefinition
		state.StepIndex = indexOfPhase(steps, PhaseDefinition)
		return "好的，这里是正式定义：\n\n" + defStep.Content + "\n\n🤔 " + defStep.SocraticProbe
	}
	return o.advanceToNextPhase(state, steps)
}

func (o *AgentOrchestrator) handleWantExample(state *DialogState, steps []TeachingStep) string {
	exStep := findStepByPhase(steps, PhaseExample)
	if exStep != nil {
		state.CurrentPhase = PhaseExample
		state.StepIndex = indexOfPhase(steps, PhaseExample)
		return "来看一个具体的例子：\n\n" + exStep.Content + "\n\n💡 " + exStep.SocraticProbe
	}
	return o.advanceToNextPhase(state, steps)
}

func (o *AgentOrchestrator) handleContinue(state *DialogState, steps []TeachingStep) string {
	return o.advanceToNextPhase(state, steps)
}

func (o *AgentOrchestrator) handleStudentAnswer(state *DialogState, message string, steps []TeachingStep) string {
	currentStep := o.getCurrentStep(steps, state)
	if currentStep == nil {
		return "收到你的想法！输入「继续」进入下一环节。"
	}
	if state.CurrentPhase == PhasePractice {
		return evaluateStudentAnswer(message, currentStep)
	}
	return "收到你的想法！" + currentStep.SocraticProbe + "\n\n输入「继续」进入下一环节，或输入「例子」看更多例题"
}

func (o *AgentOrchestrator) handleDefault(state *DialogState, message string, steps []TeachingStep) string {
	currentStep := o.getCurrentStep(steps, state)
	if currentStep == nil {
		return o.advanceToNextPhase(state, steps)
	}
	return currentStep.SocraticProbe
}

func (o *AgentOrchestrator) advanceToNextPhase(state *DialogState, steps []TeachingStep) string {
	return o.advanceToNextPhaseWithDepth(state, steps, 0)
}

func (o *AgentOrchestrator) advanceToNextPhaseWithDepth(state *DialogState, steps []TeachingStep, depth int) string {
	if depth > 5 {
		state.CurrentPhase = PhaseSummary
		return "🎉 本节课程已全部学完！你可以返回诊断页面测试自己的掌握程度，或者选择其他知识点继续学习。"
	}

	phaseOrder := []TeachingPhase{PhaseIntro, PhaseDefinition, PhaseExample, PhasePractice, PhaseSummary}

	nextIdx := -1
	for i, phase := range phaseOrder {
		if phase == state.CurrentPhase {
			nextIdx = i + 1
			break
		}
	}

	if nextIdx >= len(phaseOrder) {
		state.CurrentPhase = PhaseSummary
		finalStep := findStepByPhase(steps, PhaseSummary)
		if finalStep != nil {
			return "🎉 课程内容已全部完成！\n\n" + finalStep.Content + "\n\n如果想复习某个部分，可以说「重新开始」或选择其他知识点学习"
		}
		return "🎉 本节课程已全部学完！你可以返回诊断页面测试自己的掌握程度，或者选择其他知识点继续学习。"
	}

	nextPhase := phaseOrder[nextIdx]
	state.CurrentPhase = nextPhase
	state.StepIndex = indexOfPhase(steps, nextPhase)

	step := findStepByPhase(steps, nextPhase)
	if step == nil {
		return o.advanceToNextPhaseWithDepth(state, steps, depth+1)
	}

	phaseLabels := map[TeachingPhase]string{
		PhaseIntro:      "📍 引入",
		PhaseDefinition: "📖 定义",
		PhaseExample:    "✏️ 例题",
		PhasePractice:   "🎯 练习",
		PhaseSummary:    "📋 总结",
	}

	response := ""
	if label, ok := phaseLabels[nextPhase]; ok {
		response += label + " → \n\n"
	}
	response += step.Content

	if step.SocraticProbe != "" {
		response += "\n\n🤔 " + step.SocraticProbe
	}

	return response
}

func (o *AgentOrchestrator) getCurrentStep(steps []TeachingStep, state *DialogState) *TeachingStep {
	if state.StepIndex >= 0 && state.StepIndex < len(steps) {
		return &steps[state.StepIndex]
	}
	return nil
}

// ===== 教学辅助函数 =====

func findStepByPhase(steps []TeachingStep, phase TeachingPhase) *TeachingStep {
	for i := range steps {
		if steps[i].Phase == phase {
			return &steps[i]
		}
	}
	return nil
}

func indexOfPhase(steps []TeachingStep, phase TeachingPhase) int {
	for i := range steps {
		if steps[i].Phase == phase {
			return i
		}
	}
	return 0
}

func getKnowledgePointName(kp string) string {
	names := map[string]string{
		"limit":                  "极限",
		"derivative":             "导数",
		"chain_rule":             "链式法则",
		"indefinite_integral":    "不定积分",
		"definite_integral":      "定积分",
		"multiple_integral":      "重积分",
		"series":                 "级数",
		"ode":                    "微分方程",
		"partial_derivative":     "偏导数",
		"continuity":             "连续性",
		"integration_by_parts":   "分部积分",
		"taylor":                 "泰勒公式",
		"application_derivative": "导数应用",
		"application_integral":   "积分应用",
	}
	if name, ok := names[kp]; ok {
		return name
	}
	return kp
}

func simplifyDefinition(content string) string {
	lines := strings.Split(content, "\n")
	var coreLines []string
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line != "" && !strings.HasPrefix(line, "【") && len(line) > 10 {
			coreLines = append(coreLines, line)
			if len(coreLines) >= 2 {
				break
			}
		}
	}
	if len(coreLines) > 0 {
		return strings.Join(coreLines, "\n")
	}
	return content
}

func extractCoreIdea(content string) string {
	if strings.Contains(content, "极限") {
		return "极限描述的是一种「趋势」——当自变量无限接近某值时，函数值的走向"
	}
	if strings.Contains(content, "导数") {
		return "导数就是瞬时变化率 = 切线斜率"
	}
	if strings.Contains(content, "积分") {
		return "积分是求和的极限，定积分算面积/体积"
	}
	return "抓住核心思想：理解「为什么」比记住公式更重要"
}

func breakDownExample(content string) string {
	lines := strings.Split(content, "\n")
	var result []string
	inSolution := false
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "解：") || strings.HasPrefix(line, "步骤") {
			inSolution = true
		}
		if inSolution && line != "" {
			result = append(result, "→ "+line)
		}
	}
	if len(result) > 0 {
		return strings.Join(result, "\n")
	}
	return content
}

func givePracticeHint(content string) string {
	if strings.Contains(content, "极限") {
		return "提示：回忆重要极限公式，(1+1/x)^x 当 x→∞ 时趋近于 e"
	}
	if strings.Contains(content, "导数") || strings.Contains(content, "求导") {
		return "提示：先确定用哪个求导法则（幂函数/乘积/链式），然后一步步来"
	}
	if strings.Contains(content, "积分") {
		return "提示：先确定被积函数的类型，再用对应的积分公式"
	}
	return "提示：回顾一下本节的核心公式和例题方法，思路会清晰很多"
}

func evaluateStudentAnswer(answer string, step *TeachingStep) string {
	a := strings.ToLower(strings.TrimSpace(answer))
	isPositive := strings.Contains(a, "对") || strings.Contains(a, "正确") || strings.Contains(a, "是") ||
		strings.Contains(a, "yes") || strings.Contains(a, "=") || strings.Contains(a, "答案")

	if isPositive {
		return "✅ 很好！看来你已经掌握了这个要点。\n\n" + step.SocraticProbe + "\n\n输入「继续」进入下一个教学环节"
	}

	return "🤔 思路方向值得肯定，但可能还需要调整。\n\n让我给你一些引导：" + step.SocraticProbe +
		"\n\n也可以直接说「看答案」来查看完整解答过程"
}

func summarizeKeyPoints(content string) string {
	lines := strings.Split(content, "\n")
	var points []string
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "①") || strings.HasPrefix(line, "②") || strings.HasPrefix(line, "③") || strings.HasPrefix(line, "④") {
			points = append(points, line)
		}
	}
	if len(points) > 0 {
		return strings.Join(points, "\n")
	}
	return content
}

func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}

// ===== HTTP 路由 =====

func main() {
	_ = rand.New(rand.NewSource(time.Now().UnixNano()))
	initAllowedOrigins()

	orchestrator := NewAgentOrchestrator()
	orchestrator.Start()

	r := gin.Default()
	r.Use(corsMiddleware())
	r.Use(rateLimitMiddleware(orchestrator))
	r.Use(securityHeadersMiddleware())

	api := r.Group("/api")
	{
		api.GET("/agents/status", func(c *gin.Context) {
			c.JSON(200, orchestrator.GetAgentStates())
		})

		api.POST("/diagnosis/submit", func(c *gin.Context) {
			var req DiagnosisRequest
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(400, gin.H{"error": "请求格式错误"})
				return
			}

			answersRaw, _ := json.Marshal(req.Answers)
			var answers []interface{}
			json.Unmarshal(answersRaw, &answers)

			resultCh := orchestrator.SubmitTask(AgentTask{
				ID:     "diag_" + time.Now().Format("20060102150405"),
				Type:   Diagnostician,
				UserID: req.UserID,
				Input:  map[string]interface{}{"userId": req.UserID, "answers": answers},
			})

			select {
			case result := <-resultCh:
				if !result.Success {
					c.JSON(500, gin.H{"error": result.Error})
					return
				}
				c.JSON(200, result.Data)
			case <-time.After(30 * time.Second):
				c.JSON(504, gin.H{"error": "请求超时，请稍后重试"})
			}
		})

		api.POST("/teaching/message", func(c *gin.Context) {
			var req TeachingRequest
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(400, gin.H{"error": "请求格式错误"})
				return
			}

			resultCh := orchestrator.SubmitTask(AgentTask{
				ID:     "teach_" + time.Now().Format("20060102150405"),
				Type:   Tutor,
				UserID: req.UserID,
				Input:  map[string]interface{}{"userId": req.UserID, "message": req.Message, "knowledgePoint": req.KnowledgePoint},
			})

			select {
			case result := <-resultCh:
				if !result.Success {
					c.JSON(500, gin.H{"error": result.Error})
					return
				}
				c.JSON(200, result.Data)
			case <-time.After(30 * time.Second):
				c.JSON(504, gin.H{"error": "请求超时，请稍后重试"})
			}
		})

		api.POST("/path/generate", func(c *gin.Context) {
			var req PathRequest
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(400, gin.H{"error": "请求格式错误"})
				return
			}

			resultCh := orchestrator.SubmitTask(AgentTask{
				ID:     "plan_" + time.Now().Format("20060102150405"),
				Type:   Planner,
				UserID: req.UserID,
				Input:  map[string]interface{}{"userId": req.UserID, "diagnosis": req.Diagnosis},
			})

			select {
			case result := <-resultCh:
				if !result.Success {
					c.JSON(500, gin.H{"error": result.Error})
					return
				}
				c.JSON(200, result.Data)
			case <-time.After(30 * time.Second):
				c.JSON(504, gin.H{"error": "请求超时，请稍后重试"})
			}
		})

		api.POST("/report/generate", func(c *gin.Context) {
			var req ReportRequest
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(400, gin.H{"error": "请求格式错误"})
				return
			}

			resultCh := orchestrator.SubmitTask(AgentTask{
				ID:     "eval_" + time.Now().Format("20060102150405"),
				Type:   Evaluator,
				UserID: req.UserID,
				Input:  map[string]interface{}{"userId": req.UserID},
			})

			select {
			case result := <-resultCh:
				if !result.Success {
					c.JSON(500, gin.H{"error": result.Error})
					return
				}
				c.JSON(200, result.Data)
			case <-time.After(30 * time.Second):
				c.JSON(504, gin.H{"error": "请求超时，请稍后重试"})
			}
		})

		api.POST("/chain/execute", func(c *gin.Context) {
			var req ChainRequest
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(400, gin.H{"error": "请求格式错误"})
				return
			}

			resultCh := orchestrator.SubmitChain(req.UserID, req.Input)

			select {
			case result := <-resultCh:
				if !result.Success {
					c.JSON(500, gin.H{"error": result.Error})
					return
				}
				c.JSON(200, result.Data)
			case <-time.After(60 * time.Second):
				c.JSON(504, gin.H{"error": "请求超时，请稍后重试"})
			}
		})
	}

	r.GET("/ws/agents", orchestrator.handleWebSocket)
	r.Static("/static", "./static")

	log.Println("EduMind Agent调度网关启动于 :8080")
	log.Println("API文档:")
	log.Println("  GET  /api/agents/status    - Agent状态")
	log.Println("  POST /api/diagnosis/submit - 提交诊断")
	log.Println("  POST /api/teaching/message - 教学对话")
	log.Println("  POST /api/path/generate    - 生成路径")
	log.Println("  POST /api/report/generate  - 生成报告")
	log.Println("  POST /api/chain/execute    - 执行Agent链")
	log.Println("  WS   /ws/agents            - Agent状态WebSocket")

	r.Run(":8080")
}

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		if origin != "" && isOriginAllowed(origin) {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
			c.Writer.Header().Set("Vary", "Origin")
		} else if origin == "" {
			c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		}
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		c.Writer.Header().Set("Access-Control-Max-Age", "86400")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}

func rateLimitMiddleware(o *AgentOrchestrator) gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		if !o.rateLimiter.Allow(ip) {
			c.JSON(429, gin.H{"error": "请求过于频繁，请稍后再试"})
			c.Abort()
			return
		}
		c.Next()
	}
}

func securityHeadersMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("X-Content-Type-Options", "nosniff")
		c.Writer.Header().Set("X-Frame-Options", "DENY")
		c.Writer.Header().Set("X-XSS-Protection", "1; mode=block")
		c.Writer.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Writer.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:")
		c.Writer.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		c.Next()
	}
}

func (o *AgentOrchestrator) cleanupStaleStates() {
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		now := time.Now()

		o.dialogMu.Lock()
		for key, state := range o.dialogStates {
			if !state.LastActiveAt.IsZero() && now.Sub(state.LastActiveAt) > dialogStateTTL {
				delete(o.dialogStates, key)
			}
		}
		o.dialogMu.Unlock()

		o.ctxMu.Lock()
		for userID, entry := range o.contextStore {
			if len(entry.data) == 0 || now.Sub(entry.createdAt) > contextStoreTTL {
				delete(o.contextStore, userID)
			}
		}
		o.ctxMu.Unlock()
	}
}

// EduMind Go Agent调度网关
// 核心架构：goroutine + channel 实现多Agent并发协作
// 替代C++并行栈，代码更简洁、并发更安全

package main

import (
	"encoding/json"
	"log"
	"math/rand"
	"net/http"
	"sync"
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
	Type      AgentType   `json:"type"`
	Name      string      `json:"name"`
	Status    AgentStatus `json:"status"`
	Icon      string      `json:"icon"`
	Color     string      `json:"color"`
	Description string   `json:"description"`
	LastActive int64      `json:"lastActive"`
	TaskCount  int        `json:"taskCount"`
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

// ===== Agent 调度器（核心）=====
// 使用 goroutine + channel 实现轻量并发

type AgentOrchestrator struct {
	// Agent 状态管理
	agents map[AgentType]*AgentState
	mu     sync.RWMutex

	// 任务队列（每个Agent一个channel）
	taskQueues map[AgentType]chan AgentTask

	// WebSocket 广播channel
	broadcast chan WSMessage

	// 客户端管理
	clients map[*websocket.Conn]bool
	wsMu    sync.RWMutex

	// 上下文传递（Agent间通信）
	contextStore map[string]map[string]interface{}
	ctxMu        sync.RWMutex
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
		clients:      make(map[*websocket.Conn]bool),
		contextStore: make(map[string]map[string]interface{}),
	}
}

// Start 启动所有Agent工作goroutine
func (o *AgentOrchestrator) Start() {
	// 启动4个Agent工作goroutine
	go o.agentWorker(Diagnostician, o.handleDiagnosis)
	go o.agentWorker(Tutor, o.handleTeaching)
	go o.agentWorker(Planner, o.handlePlanning)
	go o.agentWorker(Evaluator, o.handleEvaluation)

	// 启动广播goroutine
	go o.broadcastWorker()

	log.Println("Agent调度器已启动，4个Agent工作goroutine运行中")
}

// agentWorker Agent工作goroutine
// 每个Agent独占一个goroutine，从各自的channel接收任务
func (o *AgentOrchestrator) agentWorker(agentType AgentType, handler func(AgentTask) TaskResult) {
	log.Printf("[%s] Agent工作goroutine启动\n", agentType)

	for task := range o.taskQueues[agentType] {
		// 更新状态为运行中
		o.updateAgentStatus(agentType, Running)

		// 模拟处理时间（实际场景中这里是AI推理）
		time.Sleep(time.Duration(500+rand.Intn(1500)) * time.Millisecond)

		// 执行任务
		result := handler(task)

		// 发送结果
		task.Result <- result

		// 更新状态
		o.updateAgentStatus(agentType, Idle)
		o.incrementTaskCount(agentType)

		// 广播Agent消息
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
	if !ok {
		return TaskResult{Success: false, Error: "缺少答题数据"}
	}

	// 模拟诊断分析
	weakPoints := []string{}
	strongPoints := []string{}
	scores := map[string]float64{}

	// 简单的诊断逻辑
	correctCount := 0
	for i, ans := range answers {
		isCorrect := ans.(map[string]interface{})["correct"].(bool)
		kp := ans.(map[string]interface{})["knowledgePoint"].(string)

		if isCorrect {
			correctCount++
			if !contains(strongPoints, kp) {
				strongPoints = append(strongPoints, kp)
			}
		} else {
			if !contains(weakPoints, kp) {
				weakPoints = append(weakPoints, kp)
			}
		}

		// 更新知识点得分
		if _, exists := scores[kp]; !exists {
			scores[kp] = 0
		}
		if isCorrect {
			scores[kp] += 100.0 / float64(len(answers))
		}
		_ = i
	}

	overall := "intermediate"
	if correctCount <= 2 {
		overall = "beginner"
	} else if correctCount >= 4 {
		overall = "advanced"
	}

	return TaskResult{
		Success: true,
		Data: map[string]interface{}{
			"weakPoints":   weakPoints,
			"strongPoints": strongPoints,
			"overallLevel": overall,
			"detailScores": scores,
			"accuracy":     float64(correctCount) / float64(len(answers)),
		},
	}
}

func (o *AgentOrchestrator) handleTeaching(task AgentTask) TaskResult {
	message, ok := task.Input["message"].(string)
	if !ok {
		return TaskResult{Success: false, Error: "缺少消息内容"}
	}

	knowledgePoint, _ := task.Input["knowledgePoint"].(string)

	// 模拟Socratic教学响应
	response := generateSocraticResponse(message, knowledgePoint)

	return TaskResult{
		Success: true,
		Data: map[string]interface{}{
			"response":       response,
			"knowledgePoint": knowledgePoint,
			"isSocratic":     true,
		},
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
			"overallScore":        75 + rand.Intn(20),
			"questionsAnswered":   50 + rand.Intn(50),
			"accuracy":            0.7 + float64(rand.Intn(25))/100,
			"timeSpent":           120 + rand.Intn(200),
			"masteryLevel":        0.6 + float64(rand.Intn(35))/100,
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
		o.contextStore[userID] = make(map[string]interface{})
	}
	o.contextStore[userID][key] = value
}

func (o *AgentOrchestrator) getContext(userID string, key string) (interface{}, bool) {
	o.ctxMu.RLock()
	defer o.ctxMu.RUnlock()

	if ctx, ok := o.contextStore[userID]; ok {
		val, exists := ctx[key]
		return val, exists
	}
	return nil, false
}

// ===== WebSocket 广播 =====

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // 允许跨域
	},
}

func (o *AgentOrchestrator) broadcastWorker() {
	for msg := range o.broadcast {
		o.wsMu.RLock()
		clients := make([]*websocket.Conn, 0, len(o.clients))
		for client := range o.clients {
			clients = append(clients, client)
		}
		o.wsMu.RUnlock()

		for _, client := range clients {
			if err := client.WriteJSON(msg); err != nil {
				// 移除失败的连接
				o.wsMu.Lock()
				delete(o.clients, client)
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
	defer conn.Close()

	o.wsMu.Lock()
	o.clients[conn] = true
	o.wsMu.Unlock()

	// 发送初始Agent状态
	states := o.GetAgentStates()
	conn.WriteJSON(WSMessage{
		Type:      "agent_status",
		Payload:   states,
		Timestamp: time.Now().UnixMilli(),
	})

	// 保持连接
	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			o.wsMu.Lock()
			delete(o.clients, conn)
			o.wsMu.Unlock()
			break
		}
	}
}

// ===== 工具函数 =====

func generateSocraticResponse(studentMessage string, knowledgePoint string) string {
	// 模拟Socratic教学法的反问引导
	responses := []string{
		"这是一个很好的问题！让我们从另一个角度来思考：你觉得这个问题的核心概念是什么？",
		"不错！那么如果我们将条件稍微改变一下，结果会怎样呢？",
		"很好！你能用自己的话解释一下这个定理的含义吗？",
		"正确！那么下一步我们应该如何运用这个结论呢？",
		"接近了！想想我们之前学过的相关知识，有没有类似的解决方法？",
	}

	// 根据消息长度选择不同的响应
	idx := len(studentMessage) % len(responses)
	return responses[idx]
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
	// 初始化随机数
	rand.Seed(time.Now().UnixNano())

	// 创建调度器
	orchestrator := NewAgentOrchestrator()
	orchestrator.Start()

	// 设置Gin
	r := gin.Default()
	r.Use(corsMiddleware())

	// API路由
	api := r.Group("/api")
	{
		// Agent状态
		api.GET("/agents/status", func(c *gin.Context) {
			c.JSON(200, orchestrator.GetAgentStates())
		})

		// 提交诊断任务
		api.POST("/diagnosis/submit", func(c *gin.Context) {
			var input map[string]interface{}
			if err := c.BindJSON(&input); err != nil {
				c.JSON(400, gin.H{"error": err.Error()})
				return
			}

			result := <-orchestrator.SubmitTask(AgentTask{
				ID:     "diag_" + time.Now().Format("20060102150405"),
				Type:   Diagnostician,
				UserID: input["userId"].(string),
				Input:  input,
			})

			if !result.Success {
				c.JSON(500, gin.H{"error": result.Error})
				return
			}

			c.JSON(200, result.Data)
		})

		// 提交教学任务
		api.POST("/teaching/message", func(c *gin.Context) {
			var input map[string]interface{}
			if err := c.BindJSON(&input); err != nil {
				c.JSON(400, gin.H{"error": err.Error()})
				return
			}

			result := <-orchestrator.SubmitTask(AgentTask{
				ID:     "teach_" + time.Now().Format("20060102150405"),
				Type:   Tutor,
				UserID: input["userId"].(string),
				Input:  input,
			})

			if !result.Success {
				c.JSON(500, gin.H{"error": result.Error})
				return
			}

			c.JSON(200, result.Data)
		})

		// 生成学习路径
		api.POST("/path/generate", func(c *gin.Context) {
			var input map[string]interface{}
			if err := c.BindJSON(&input); err != nil {
				c.JSON(400, gin.H{"error": err.Error()})
				return
			}

			result := <-orchestrator.SubmitTask(AgentTask{
				ID:     "plan_" + time.Now().Format("20060102150405"),
				Type:   Planner,
				UserID: input["userId"].(string),
				Input:  input,
			})

			if !result.Success {
				c.JSON(500, gin.H{"error": result.Error})
				return
			}

			c.JSON(200, result.Data)
		})

		// 生成评估报告
		api.POST("/report/generate", func(c *gin.Context) {
			var input map[string]interface{}
			if err := c.BindJSON(&input); err != nil {
				c.JSON(400, gin.H{"error": err.Error()})
				return
			}

			result := <-orchestrator.SubmitTask(AgentTask{
				ID:     "eval_" + time.Now().Format("20060102150405"),
				Type:   Evaluator,
				UserID: input["userId"].(string),
				Input:  input,
			})

			if !result.Success {
				c.JSON(500, gin.H{"error": result.Error})
				return
			}

			c.JSON(200, result.Data)
		})

		// 执行完整Agent链
		api.POST("/chain/execute", func(c *gin.Context) {
			var input map[string]interface{}
			if err := c.BindJSON(&input); err != nil {
				c.JSON(400, gin.H{"error": err.Error()})
				return
			}

			result := <-orchestrator.SubmitChain(
				input["userId"].(string),
				input,
			)

			if !result.Success {
				c.JSON(500, gin.H{"error": result.Error})
				return
			}

			c.JSON(200, result.Data)
		})
	}

	// WebSocket路由
	r.GET("/ws/agents", orchestrator.handleWebSocket)

	// 静态文件
	r.Static("/", "./static")

	// 启动服务
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

// CORS中间件
func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}

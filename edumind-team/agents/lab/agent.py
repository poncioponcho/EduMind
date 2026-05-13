"""Lab Assistant Agent — 实验助教，代码执行/数学计算/可视化"""

from __future__ import annotations

import json
import logging
import os
import re
import subprocess
import time

from a2a_bus.protocol import A2AMessage, MsgType

logger = logging.getLogger("edumind-team.agents.lab")

BLOCKED_IMPORTS = {
    "os", "sys", "subprocess", "shutil", "signal", "socket",
    "http", "urllib", "requests", "pathlib", "ctypes",
    "multiprocessing", "threading", "pickle", "shelve",
    "importlib", "code", "codeop", "compile", "exec", "eval",
    "open", "globals", "locals", "vars", "dir", "getattr",
    "setattr", "delattr", "hasattr", "__import__",
}

ALLOWED_MODULES = {
    "math", "numpy", "sympy", "matplotlib", "random",
    "itertools", "collections", "fractions", "decimal",
    "statistics", "cmath",
}

SANDBOX_PREAMBLE = """
import sys
import builtins

_original_import = builtins.__import__

def _restricted_import(name, *args, **kwargs):
    top_level = name.split('.')[0]
    if top_level not in {""" + ", ".join(f"'{m}'" for m in ALLOWED_MODULES) + """}:
        raise ImportError(f"Module '{name}' is not allowed in sandbox")
    return _original_import(name, *args, **kwargs)

builtins.__import__ = _restricted_import
del builtins
del sys
"""


class LabAgent:
    def __init__(self, bus, llm=None):
        self.bus = bus
        self.llm = llm
        self.agent_id = "lab_assistant"

    async def handle(self, msg: A2AMessage) -> A2AMessage:
        if msg.msg_type in (MsgType.TASK_REQUEST.value, MsgType.DELEGATION.value):
            return await self._handle_task(msg)
        elif msg.msg_type == MsgType.BROADCAST.value:
            return self._make_response(msg, {"message": "broadcast received"})
        return self._make_response(msg, {"message": "ok"})

    async def _handle_task(self, msg: A2AMessage) -> A2AMessage:
        user_input = msg.content.get("message", "")
        student_id = msg.content.get("student_id", "anonymous")

        skill = msg.content.get("skill", "")
        if skill == "run_code":
            result = await self._execute_code(user_input, student_id)
        elif skill == "generate_plot":
            result = await self._generate_plot(user_input, student_id)
        elif skill == "solve_math":
            result = await self._calculate(user_input, student_id)
        elif "代码" in user_input or "运行" in user_input or "run" in user_input.lower():
            result = await self._execute_code(user_input, student_id)
        elif "画" in user_input or "图" in user_input or "plot" in user_input.lower():
            result = await self._generate_plot(user_input, student_id)
        elif "计算" in user_input or "算" in user_input or "solve" in user_input.lower():
            result = await self._calculate(user_input, student_id)
        else:
            if self.llm:
                try:
                    from langchain_core.messages import SystemMessage, HumanMessage
                    response = await self.llm.ainvoke([
                        SystemMessage(content="你是实验助教。根据学生需求，提供代码示例、计算步骤或绘图建议。简洁实用。"),
                        HumanMessage(content=user_input),
                    ])
                    result = {"message": response.content, "type": "llm_response"}
                except Exception:
                    result = {"message": "我可以帮你运行代码、计算数学问题或绘制函数图像。请告诉我你需要什么？", "type": "fallback"}
            else:
                result = {"message": "我可以帮你运行代码、计算数学问题或绘制函数图像。请告诉我你需要什么？", "type": "fallback"}

        self.bus.persistence.save_interaction(student_id, {
            "type": "lab_result",
            "task_type": result.get("type", "unknown"),
            "timestamp": time.time(),
        })

        return self._make_response(msg, result)

    def _validate_code(self, code: str) -> tuple[bool, str]:
        for token in BLOCKED_IMPORTS:
            if token in code and token not in ALLOWED_MODULES:
                if token in ("open",):
                    if re.search(r'\bopen\s*\(', code):
                        return False, f"安全限制：不允许使用 '{token}' 函数"
                elif token in ("exec", "eval"):
                    if re.search(rf'\b{token}\s*\(', code):
                        return False, f"安全限制：不允许使用 '{token}' 函数"
                elif token in ("__import__",):
                    if token in code:
                        return False, f"安全限制：不允许使用 '{token}'"
                else:
                    pattern = rf'(?:import\s+{token}|from\s+{token}\s+import)'
                    if re.search(pattern, code):
                        return False, f"安全限制：不允许导入模块 '{token}'"
        return True, ""

    async def _execute_code(self, user_input: str, student_id: str) -> dict:
        code = self._extract_code(user_input)
        if not code:
            return {"message": "请提供要运行的代码，例如：运行代码 ```python\nprint(2+3)\n```", "type": "clarify"}

        is_safe, reason = self._validate_code(code)
        if not is_safe:
            return {"message": f"🚫 {reason}", "type": "security_error"}

        sandboxed_code = SANDBOX_PREAMBLE + "\n" + code

        try:
            result = subprocess.run(
                ["python3", "-c", sandboxed_code],
                capture_output=True, text=True, timeout=10,
                env={
                    "PYTHONPATH": "",
                    "HOME": "/tmp",
                    "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
                },
                cwd="/tmp",
            )
            if result.returncode == 0:
                output = result.stdout[:2000] if result.stdout else "(无输出)"
            else:
                output = result.stderr[:500] if result.stderr else "未知错误"
            return {"message": f"💻 代码执行结果：\n```\n{output}\n```", "type": "code_result"}
        except subprocess.TimeoutError:
            return {"message": "⏰ 代码执行超时（10秒限制），请检查是否有死循环", "type": "timeout"}
        except Exception as e:
            return {"message": f"❌ 执行错误: {type(e).__name__}", "type": "error"}

    async def _generate_plot(self, user_input: str, student_id: str) -> dict:
        func_match = re.search(r'(?:画|plot|绘制)\s*(.+?)(?:的?图像|的?图|graph)?(?:\s|$)', user_input, re.IGNORECASE)
        func_name = func_match.group(1).strip() if func_match else "sin(x)"

        range_match = re.search(r'\[([-\d.π]+)\s*[,，]\s*([-\d.π]+)\]', user_input)
        x_min = "-6.28"
        x_max = "6.28"
        if range_match:
            x_min = range_match.group(1).replace('π', '3.14159')
            x_max = range_match.group(2).replace('π', '3.14159')

        plot_code = f"""
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
import os

x = np.linspace({x_min}, {x_max}, 500)
try:
    y = {func_name}
except Exception:
    y = np.sin(x)

fig, ax = plt.subplots(figsize=(8, 5))
ax.plot(x, y, linewidth=2)
ax.grid(True, alpha=0.3)
ax.set_xlabel('x')
ax.set_ylabel('y')
ax.set_title('{func_name}')

plot_dir = os.environ.get('PLOT_DIR', '/tmp')
os.makedirs(plot_dir, exist_ok=True)
filepath = os.path.join(plot_dir, 'plot_{hash(user_input) & 0xFFFFFFFF:x}.png')
fig.savefig(filepath, dpi=100, bbox_inches='tight')
plt.close(fig)
print(filepath)
"""
        is_safe, reason = self._validate_code(plot_code)
        if not is_safe:
            return {"message": f"🚫 {reason}", "type": "security_error"}

        try:
            result = subprocess.run(
                ["python3", "-c", plot_code],
                capture_output=True, text=True, timeout=15,
                env={
                    "PYTHONPATH": "",
                    "HOME": "/tmp",
                    "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
                    "PLOT_DIR": os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "assets", "plots"),
                    "MPLCONFIGDIR": "/tmp",
                },
                cwd="/tmp",
            )
            if result.returncode == 0 and result.stdout.strip():
                filepath = result.stdout.strip().split('\n')[-1]
                filename = os.path.basename(filepath)
                return {
                    "message": f"📊 函数图像已生成！",
                    "type": "plot_result",
                    "plot_url": f"/plots/{filename}",
                }
            else:
                error = result.stderr[:300] if result.stderr else "未知错误"
                return {"message": f"📊 图像生成失败: {error}", "type": "plot_error"}
        except subprocess.TimeoutError:
            return {"message": "⏰ 图像生成超时", "type": "timeout"}
        except Exception as e:
            return {"message": f"❌ 图像生成错误: {type(e).__name__}", "type": "error"}

    async def _calculate(self, user_input: str, student_id: str) -> dict:
        calc_code = """
import sympy as sp
import json

x = sp.Symbol('x')
"""
        equation_match = re.search(r'(?:计算|求解|solve)\s*(.+?)(?:的?解)?$', user_input, re.IGNORECASE)
        if equation_match:
            expr = equation_match.group(1).strip()
            if '=' in expr and '==' not in expr:
                expr = expr.replace('=', '-')
            calc_code += f"""
try:
    result = sp.solve({expr}, x)
    print(json.dumps({{"result": str(result), "steps": "使用SymPy求解", "type": "equation"}}))
except Exception as e:
    print(json.dumps({{"error": str(e), "type": "error"}}))
"""
        else:
            expr_match = re.search(r'(?:计算|算)\s*(.+?)$', user_input, re.IGNORECASE)
            expr = expr_match.group(1).strip() if expr_match else user_input
            calc_code += f"""
try:
    result = sp.sympify("{expr}")
    print(json.dumps({{"result": str(result), "steps": "使用SymPy计算", "type": "expression"}}))
except Exception as e:
    print(json.dumps({{"error": str(e), "type": "error"}}))
"""

        try:
            result = subprocess.run(
                ["python3", "-c", calc_code],
                capture_output=True, text=True, timeout=10,
                env={
                    "PYTHONPATH": "",
                    "HOME": "/tmp",
                    "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
                },
                cwd="/tmp",
            )
            if result.returncode == 0 and result.stdout.strip():
                try:
                    data = json.loads(result.stdout.strip().split('\n')[-1])
                    if "error" in data:
                        return {"message": f"🔢 计算出错: {data['error']}", "type": "calc_error"}
                    return {
                        "message": f"🔢 计算结果：**{data['result']}**\n（{data['steps']}）",
                        "type": "calc_result",
                        "result": data["result"],
                    }
                except json.JSONDecodeError:
                    return {"message": f"🔢 结果：{result.stdout.strip()[:500]}", "type": "calc_result"}
            else:
                error = result.stderr[:300] if result.stderr else "未知错误"
                return {"message": f"🔢 计算失败: {error}", "type": "calc_error"}
        except subprocess.TimeoutError:
            return {"message": "⏰ 计算超时", "type": "timeout"}
        except Exception as e:
            return {"message": f"❌ 计算错误: {type(e).__name__}", "type": "error"}

    def _extract_code(self, text: str) -> str:
        code_match = re.search(r'```(?:python)?\s*\n(.*?)```', text, re.DOTALL)
        if code_match:
            return code_match.group(1).strip()
        after_keyword = re.split(r'(?:代码|运行|run|execute)[:：]\s*', text, flags=re.IGNORECASE)
        if len(after_keyword) > 1:
            return after_keyword[1].strip()[:500]
        return ""

    def _make_response(self, orig: A2AMessage, content: dict) -> A2AMessage:
        return A2AMessage(
            task_id=orig.task_id,
            from_agent=self.agent_id,
            to_agent=orig.from_agent,
            msg_type=MsgType.RESULT.value,
            content=content,
            parent_id=orig.task_id,
        )

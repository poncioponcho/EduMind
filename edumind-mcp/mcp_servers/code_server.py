import sys
import io
import traceback
import contextlib
import re
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("edumind-code")

BLOCKED_MODULES = {
    "os", "subprocess", "shutil", "signal", "ctypes",
    "socket", "http", "urllib", "requests", "ftplib",
    "smtplib", "telnetlib", "xmlrpc", "multiprocessing",
}

BLOCKED_PATTERNS = [
    r"__import__\s*\(",
    r"import\s+os\b",
    r"import\s+subprocess\b",
    r"import\s+shutil\b",
    r"import\s+socket\b",
    r"from\s+os\b",
    r"from\s+subprocess\b",
    r"from\s+shutil\b",
    r"from\s+socket\b",
    r"open\s*\(\s*['\"]/",
    r"eval\s*\(",
    r"exec\s*\(",
    r"compile\s*\(",
    r"globals\s*\(\s*\)",
    r"locals\s*\(\s*\)",
    r"getattr\s*\(",
    r"setattr\s*\(",
    r"delattr\s*\(",
    r"__builtins__",
    r"__class__",
    r"__subclasses__",
    r"sys\._",
    r"sys\.path",
    r"sys\.modules",
]

MAX_CODE_LENGTH = 5000
MAX_EXECUTION_TIME = 10


def _validate_code(code: str) -> str | None:
    if len(code) > MAX_CODE_LENGTH:
        return f"代码过长（最多{MAX_CODE_LENGTH}字符）"

    for pattern in BLOCKED_PATTERNS:
        if re.search(pattern, code):
            return f"代码包含不允许的操作: {pattern}"

    return None


_exec_globals = {
    "__builtins__": {
        "print": print, "range": range, "len": len, "int": int,
        "float": float, "str": str, "list": list, "dict": dict,
        "tuple": tuple, "set": set, "bool": bool, "abs": abs,
        "max": max, "min": min, "sum": sum, "round": round,
        "enumerate": enumerate, "zip": zip, "map": map, "filter": filter,
        "sorted": sorted, "reversed": reversed, "type": type,
        "isinstance": isinstance, "hasattr": hasattr,
        "ValueError": ValueError, "TypeError": TypeError,
        "KeyError": KeyError, "IndexError": IndexError,
        "RuntimeError": RuntimeError, "Exception": Exception,
    },
    "__name__": "__main__",
}


def _safe_exec(code: str, globals_dict: dict) -> None:
    for line in code.split("\n"):
        stripped = line.strip()
        if stripped.startswith("import ") or stripped.startswith("from "):
            module_name = stripped.split()[1].split(".")[0]
            if module_name in BLOCKED_MODULES:
                raise ImportError(f"模块 '{module_name}' 不允许在沙箱中使用")

    exec(code, globals_dict)


@mcp.tool()
def execute_python(code: str) -> str:
    """执行Python代码并返回输出结果。支持numpy、sympy等科学计算库。
    注意：代码在沙箱环境中运行，某些系统操作被限制。
    例: execute_python("import numpy as np; print(np.linspace(0,1,5))")
    """
    validation_error = _validate_code(code)
    if validation_error:
        return f"代码验证失败: {validation_error}"

    stdout_capture = io.StringIO()
    stderr_capture = io.StringIO()

    try:
        with contextlib.redirect_stdout(stdout_capture), contextlib.redirect_stderr(stderr_capture):
            _safe_exec(code, _exec_globals)

        output = stdout_capture.getvalue()
        errors = stderr_capture.getvalue()

        result_parts = [f"代码:\n```python\n{code}\n```"]
        if output.strip():
            result_parts.append(f"输出:\n{output.strip()}")
        if errors.strip():
            result_parts.append(f"警告:\n{errors.strip()}")
        if not output.strip() and not errors.strip():
            result_parts.append("执行完成（无输出）")

        return "\n\n".join(result_parts)
    except ImportError as e:
        return f"代码:\n```python\n{code}\n```\n\n安全限制: {e}"
    except Exception:
        tb = traceback.format_exc()
        return f"代码:\n```python\n{code}\n```\n\n错误:\n{tb}"


@mcp.tool()
def run_cell(code: str, cell_id: str = "default") -> str:
    """在持久化环境中执行代码单元格，变量在单元格间共享。
    注意：代码在沙箱环境中运行，某些系统操作被限制。
    例: run_cell("import numpy as np; x = np.array([1,2,3])", "cell1")
        run_cell("print(x * 2)", "cell2")
    """
    validation_error = _validate_code(code)
    if validation_error:
        return f"代码验证失败: {validation_error}"

    stdout_capture = io.StringIO()

    try:
        with contextlib.redirect_stdout(stdout_capture):
            _safe_exec(code, _exec_globals)

        output = stdout_capture.getvalue()
        result_parts = [f"单元格 [{cell_id}]:\n```python\n{code}\n```"]
        if output.strip():
            result_parts.append(f"输出:\n{output.strip()}")
        else:
            result_parts.append("执行完成（无输出）")

        return "\n\n".join(result_parts)
    except ImportError as e:
        return f"单元格 [{cell_id}] 安全限制: {e}"
    except Exception:
        tb = traceback.format_exc()
        return f"单元格 [{cell_id}] 错误:\n{tb}"


if __name__ == "__main__":
    mcp.run(transport="stdio")

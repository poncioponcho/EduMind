import sys
import io
import traceback
import contextlib
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("edumind-code")

_exec_globals = {
    "__builtins__": __builtins__,
    "__name__": "__main__",
}


@mcp.tool()
def execute_python(code: str) -> str:
    """执行Python代码并返回输出结果。支持numpy、sympy等科学计算库。
    例: execute_python("import numpy as np; print(np.linspace(0,1,5))")
    """
    stdout_capture = io.StringIO()
    stderr_capture = io.StringIO()

    try:
        with contextlib.redirect_stdout(stdout_capture), contextlib.redirect_stderr(stderr_capture):
            exec(code, _exec_globals)

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
    except Exception:
        tb = traceback.format_exc()
        return f"代码:\n```python\n{code}\n```\n\n错误:\n{tb}"


@mcp.tool()
def run_cell(code: str, cell_id: str = "default") -> str:
    """在持久化环境中执行代码单元格，变量在单元格间共享。
    例: run_cell("import numpy as np; x = np.array([1,2,3])", "cell1")
        run_cell("print(x * 2)", "cell2")
    """
    stdout_capture = io.StringIO()

    try:
        with contextlib.redirect_stdout(stdout_capture):
            exec(code, _exec_globals)

        output = stdout_capture.getvalue()
        result_parts = [f"单元格 [{cell_id}]:\n```python\n{code}\n```"]
        if output.strip():
            result_parts.append(f"输出:\n{output.strip()}")
        else:
            result_parts.append("执行完成（无输出）")

        return "\n\n".join(result_parts)
    except Exception:
        tb = traceback.format_exc()
        return f"单元格 [{cell_id}] 错误:\n{tb}"


@mcp.tool()
def install_package(package_name: str) -> str:
    """安装Python包。仅在需要时使用。
    例: install_package("scipy")
    """
    import subprocess
    try:
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install", package_name],
            capture_output=True, text=True, timeout=60
        )
        if result.returncode == 0:
            return f"✅ {package_name} 安装成功"
        return f"❌ 安装失败:\n{result.stderr}"
    except subprocess.TimeoutExpired:
        return f"⏱️ 安装超时（60秒）"
    except Exception as exc:
        return f"安装错误: {exc}"


if __name__ == "__main__":
    mcp.run(transport="stdio")

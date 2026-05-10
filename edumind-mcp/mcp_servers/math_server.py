import sympy
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("edumind-math")

x, y, z, t = sympy.symbols("x y z t")


@mcp.tool()
def calculate(expression: str) -> str:
    """计算数学表达式，返回分步过程和结果。支持代数、微积分、线性代数等。
    例: calculate("2**10")  calculate("sin(pi/4)")  calculate("sqrt(50)")
    """
    try:
        expr = sympy.sympify(expression, locals={
            "sin": sympy.sin, "cos": sympy.cos, "tan": sympy.tan,
            "exp": sympy.exp, "log": sympy.log, "sqrt": sympy.sqrt,
            "pi": sympy.pi, "e": sympy.E, "oo": sympy.oo,
            "Integral": sympy.Integral, "Derivative": sympy.Derivative,
        })
        simplified = sympy.simplify(expr)
        numeric = simplified.evalf() if simplified.is_number else None

        steps = [f"输入: {expression}", f"化简: {simplified}"]
        if numeric is not None and simplified != numeric:
            steps.append(f"数值: {numeric}")
        return "\n".join(steps)
    except Exception as exc:
        return f"计算错误: {exc}"


@mcp.tool()
def solve_equation(equation: str, variable: str = "x") -> str:
    """求解方程，返回解析解和数值解。
    例: solve_equation("x**2 + 5*x + 6", "x")  solve_equation("sin(x) - 0.5", "x")
    """
    try:
        var = sympy.Symbol(variable)
        expr = sympy.sympify(equation, locals={
            "sin": sympy.sin, "cos": sympy.cos, "tan": sympy.tan,
            "exp": sympy.exp, "log": sympy.log, "sqrt": sympy.sqrt,
            "pi": sympy.pi, "e": sympy.E,
        })
        solutions = sympy.solve(expr, var)

        if not solutions:
            return f"方程 {equation} = 0 关于 {variable} 无解析解"

        lines = [f"方程: {equation} = 0", f"变量: {variable}", "解:"]
        for i, sol in enumerate(solutions):
            lines.append(f"  {variable}₍{i+1}₎ = {sol}")
            numeric = sol.evalf()
            if sol != numeric:
                lines.append(f"         ≈ {numeric}")

        factored = sympy.factor(expr)
        if factored != expr:
            lines.append(f"因式分解: {factored} = 0")

        return "\n".join(lines)
    except Exception as exc:
        return f"求解错误: {exc}"


@mcp.tool()
def derivative_step(expression: str, variable: str = "x") -> str:
    """分步求导，展示求导法则和每一步。
    例: derivative_step("x**3 * sin(x)", "x")  derivative_step("exp(x**2)", "x")
    """
    try:
        var = sympy.Symbol(variable)
        expr = sympy.sympify(expression, locals={
            "sin": sympy.sin, "cos": sympy.cos, "tan": sympy.tan,
            "exp": sympy.exp, "log": sympy.log, "sqrt": sympy.sqrt,
            "pi": sympy.pi, "e": sympy.E,
        })

        result = sympy.diff(expr, var)
        simplified = sympy.simplify(result)

        lines = [
            f"求导: d/d{variable}({expression})",
            f"",
            f"步骤1: 识别函数结构",
            f"  f({variable}) = {expr}",
            f"",
            f"步骤2: 应用求导法则",
        ]

        if expr.is_Mul:
            lines.append(f"  乘积法则: (uv)' = u'v + uv'")
        elif expr.is_Pow and expr.base != sympy.E:
            lines.append(f"  链式法则 + 幂法则: d/dx[uⁿ] = n·uⁿ⁻¹·u'")
        elif expr.func == sympy.exp:
            lines.append(f"  指数法则: d/dx[eᵘ] = eᵘ·u'")
        elif expr.func in (sympy.sin, sympy.cos, sympy.tan):
            lines.append(f"  三角函数链式法则")

        lines.extend([
            f"",
            f"步骤3: 计算结果",
            f"  f'({variable}) = {simplified}",
        ])

        numeric_check = simplified.subs(var, 1).evalf() if not simplified.has(sympy.Symbol) else None
        if numeric_check is not None:
            lines.append(f"  验证 f'(1) ≈ {numeric_check}")

        return "\n".join(lines)
    except Exception as exc:
        return f"求导错误: {exc}"


@mcp.tool()
def integral_step(expression: str, variable: str = "x") -> str:
    """分步积分，展示积分方法和结果。
    例: integral_step("x**2", "x")  integral_step("sin(x)*cos(x)", "x")
    """
    try:
        var = sympy.Symbol(variable)
        expr = sympy.sympify(expression, locals={
            "sin": sympy.sin, "cos": sympy.cos, "tan": sympy.tan,
            "exp": sympy.exp, "log": sympy.log, "sqrt": sympy.sqrt,
            "pi": sympy.pi, "e": sympy.E,
        })

        result = sympy.integrate(expr, var)
        simplified = sympy.simplify(result)

        lines = [
            f"积分: ∫{expression} d{variable}",
            f"",
            f"步骤1: 识别被积函数",
            f"  f({variable}) = {expr}",
            f"",
            f"步骤2: 选择积分方法",
        ]

        if expr.is_Pow and expr.as_base_exp()[1] == -1:
            lines.append(f"  1/x 的积分 → ln|x|")
        elif expr.is_Mul:
            lines.append(f"  尝试分部积分或换元法")
        elif expr.func in (sympy.sin, sympy.cos):
            lines.append(f"  三角函数积分公式")
        else:
            lines.append(f"  幂函数积分公式: ∫xⁿdx = xⁿ⁺¹/(n+1) + C")

        lines.extend([
            f"",
            f"步骤3: 计算结果",
            f"  ∫{expression} d{variable} = {simplified} + C",
        ])

        derivative_check = sympy.diff(simplified, var)
        if sympy.simplify(derivative_check - expr) == 0:
            lines.append(f"  ✅ 验证: 求导还原正确")

        return "\n".join(lines)
    except Exception as exc:
        return f"积分错误: {exc}"


@mcp.tool()
def plot_function(function: str, x_range: str = "-5,5") -> str:
    """绘制函数图像，返回图片路径。
    例: plot_function("sin(x)", "-6.28,6.28")  plot_function("x**2 - 3*x + 2", "-2,5")
    """
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        import numpy as np

        parts = x_range.split(",")
        x_min, x_max = float(parts[0]), float(parts[1])
        x_vals = np.linspace(x_min, x_max, 1000)

        func = sympy.lambdify(x, sympy.sympify(function, locals={
            "sin": sympy.sin, "cos": sympy.cos, "tan": sympy.tan,
            "exp": sympy.exp, "log": sympy.log, "sqrt": sympy.sqrt,
            "pi": sympy.pi, "e": sympy.E,
        }), "numpy")

        y_vals = func(x_vals)

        fig, ax = plt.subplots(figsize=(8, 5))
        ax.plot(x_vals, y_vals, linewidth=2, color="#4F46E5")
        ax.set_title(f"f(x) = {function}", fontsize=14)
        ax.set_xlabel("x")
        ax.set_ylabel("f(x)")
        ax.grid(True, alpha=0.3)
        ax.axhline(y=0, color="k", linewidth=0.5)
        ax.axvline(x=0, color="k", linewidth=0.5)

        path = f"assets/plots/{hash(function) & 0xFFFFFFFF}.png"
        fig.savefig(path, dpi=150, bbox_inches="tight")
        plt.close(fig)

        return f"图像已保存: {path}\n函数: f(x) = {function}\n范围: x ∈ [{x_min}, {x_max}]"
    except Exception as exc:
        return f"绘图错误: {exc}"


if __name__ == "__main__":
    mcp.run(transport="stdio")

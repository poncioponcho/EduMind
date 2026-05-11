#!/usr/bin/env python3
import sys
import json

sys.path.insert(0, 'edumind-mcp/mcp_servers')
from viz_server import plot_function

print("=" * 60)
print("  函数图像生成功能测试")
print("=" * 60)

# 测试1: 连续函数
print("\n[测试1] 连续函数: f(x) = sin(x)")
try:
    result = plot_function("sin(x)", "-6.28,6.28", "", "连续函数示例")
    data = json.loads(result)
    if data.get('success'):
        b64_len = len(data.get('image_base64', ''))
        print(f"  ✅ 成功!")
        print(f"     - Base64长度: {b64_len:,} 字符 ({b64_len//1024:.1f} KB)")
        print(f"     - 图像URL: {data.get('image_url', 'N/A')}")
        print(f"     - 元数据: {json.dumps(data['metadata'], ensure_ascii=False, indent=6)}")
    else:
        print(f"  ❌ 失败: {result[:200]}")
except Exception as e:
    print(f"  ❌ 异常: {e}")

# 测试2: 可去间断点（带空心点和实心点）
print("\n[测试2] 可去间断点: f(x)={x², x≠2; 1, x=2}")
try:
    sp = json.dumps([
        {"x": 2, "y": 4, "type": "open", "label": "极限值(2,4)"},
        {"x": 2, "y": 1, "type": "filled", "label": "f(2)=1"}
    ])
    pw = json.dumps([
        {"expr": "x**2", "cond": "x!=2", "color": "#4F46E5"},
        {"expr": "1", "cond": "x==2", "color": "#EF4444"}
    ])
    result = plot_function("x**2", "-3,3", "-0.5,5", "可去间断点示例", sp, "removable,x=2,lim=4,val=1", pw)
    data = json.loads(result)
    if data.get('success'):
        b64_len = len(data.get('image_base64', ''))
        print(f"  ✅ 成功!")
        print(f"     - Base64长度: {b64_len:,} 字符 ({b64_len//1024:.1f} KB)")
        print(f"     - 特殊点标注: {'是' if data['metadata'].get('has_special_points') else '否'}")
        print(f"     - 间断点类型: {data['metadata'].get('discontinuity_type')}")
    else:
        print(f"  ❌ 失败: {result[:200]}")
except Exception as e:
    print(f"  ❌ 异常: {e}")

# 测试3: 跳跃间断点
print("\n[测试3] 跳跃间断点: sgn(x) 在 x=0")
try:
    result = plot_function(
        "(x>0).astype(float)*1 + (x<=0).astype(float)*(-1)",
        "-3,3",
        "-2,2",
        "跳跃间断点示例: sgn(x)",
        "",
        "jump,x=0,left=-1,right=1"
    )
    data = json.loads(result)
    if data.get('success'):
        b64_len = len(data.get('image_base64', ''))
        print(f"  ✅ 成功!")
        print(f"     - Base64长度: {b64_len:,} 字符 ({b64_len//1024:.1f} KB)")
    else:
        print(f"  ❌ 失败: {result[:200]}")
except Exception as e:
    print(f"  ❌ 异常: {e}")

print("\n" + "=" * 60)
print("  测试完成!")
print("=" * 60)

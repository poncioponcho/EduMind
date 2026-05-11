// 测试数学答案验证修复
const testCases = [
  { user: 'cotx', correct: 'cot x', desc: 'cotx vs cot x (你的问题)' },
  { user: 'cotx', correct: 'cosx/sinx', desc: 'cotx vs cosx/sinx (等价形式)' },
  { user: 'sinx', correct: 'sin x', desc: 'sinx vs sin x' },
  { user: 'ln(sinx)', correct: 'ln(sin x)', desc: 'ln(sinx) vs ln(sin x)' },
];

console.log('🧪 数学答案验证测试：\n');

testCases.forEach(({ user, correct, desc }) => {
  // 简化的标准化逻辑（模拟修复后的行为）
  const normalize = (str) => {
    let result = str.trim()
      .replace(/\s+/g, '')  // 去除所有空格
      .toLowerCase();
    
    // 标准化三角函数
    const trigFns = ['sin', 'cos', 'tan', 'cot', 'sec', 'csc'];
    trigFns.forEach(fn => {
      result = result.replace(new RegExp(fn + '\\s*', 'g'), fn);
    });
    
    return result;
  };
  
  const normUser = normalize(user);
  const normCorrect = normalize(correct);
  const match = normUser === normCorrect || 
                normUser.includes(normCorrect) || 
                normCorrect.includes(normUser);
  
  console.log(`测试: ${desc}`);
  console.log(`  输入: "${user}" → "${normUser}"`);
  console.log(`  正确: "${correct}" → "${normCorrect}"`);
  console.log(`  结果: ${match ? '✅ 通过' : '❌ 失败'}\n`);
});

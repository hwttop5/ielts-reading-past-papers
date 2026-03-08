/**
 * Iframe Communication Script
 * 用于内嵌题目页面与父窗口之间的数据同步
 * 
 * 使用方法：在题目 HTML 文件的 <head> 中添加：
 * <script src="/iframe-communication.js"></script>
 */

(function() {
  'use strict';

  console.log('📦 iframe-communication.js 开始加载');

  // 立即暴露函数，确保 grade() 可以调用
  window.sendSubmitData = function() {
    console.log('⚡ sendSubmitData 被调用');
    // 这个函数会在 DOM 加载完成后被重新定义
    console.log('⚠️  DOM 还未加载完成，等待 1 秒后重试...');
    setTimeout(() => {
      if (window._sendSubmitDataReal) {
        window._sendSubmitDataReal();
      } else {
        console.error('❌ _sendSubmitDataReal 不存在');
      }
    }, 1000);
  };

  // 获取题目信息
  function getQuestionInfo() {
    const title = document.title || '';
    const totalQuestions = document.querySelectorAll('.q-item, input[type="radio"], input.blank').length;
    return { title, totalQuestions };
  }

  // 获取用户答案
  function getUserAnswers() {
    const answers = [];
    
    // 获取单选/多选题答案
    document.querySelectorAll('input[type="radio"]:checked, input[type="checkbox"]:checked').forEach((input, index) => {
      answers[index] = input.value;
    });
    
    // 获取填空题答案
    document.querySelectorAll('input.blank, input[type="text"]').forEach((input, index) => {
      answers[index] = input.value.trim();
    });
    
    return answers;
  }

  // 获取正确答案（需要从页面中提取）
  function getCorrectAnswers() {
    // 尝试从页面脚本中获取 answers 对象
    if (window.answers && typeof window.answers === 'object') {
      console.log('✅ Found answers object:', window.answers);
      return Object.values(window.answers);
    }
    console.warn('⚠️ No answers object found');
    return [];
  }

  // 发送消息到父窗口
  function sendMessageToParent(data) {
    console.log('📤 发送消息到父窗口:', data);
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(data, '*');
      console.log('✅ 消息已发送');
    } else {
      console.error('❌ 无法访问父窗口');
    }
  }

  // 真正的发送提交数据函数
  function sendSubmitDataReal() {
    console.log('🚀 sendSubmitDataReal 开始执行');
    
    const { title, totalQuestions } = getQuestionInfo();
    const answers = getUserAnswers();
    const correctAnswers = getCorrectAnswers();
    
    console.log('📊 Collected data:', {
      title,
      totalQuestions,
      answersCount: answers.length,
      correctAnswersCount: correctAnswers.length,
      answers: answers.slice(0, 5), // 只显示前 5 个
      correctAnswers: correctAnswers.slice(0, 5)
    });
    
    // 计算分数
    let score = 0;
    answers.forEach((answer, index) => {
      if (answer && answer.toLowerCase() === correctAnswers[index]?.toLowerCase()) {
        score++;
      }
    });
    
    const data = {
      type: 'submit',
      title: title,
      totalQuestions: totalQuestions,
      answers: answers,
      correctAnswers: correctAnswers,
      score: score,
      timestamp: Date.now()
    };
    
    console.log('📨 Sending to parent:', data);
    sendMessageToParent(data);
  }

  // 监听 Submit 按钮点击（备用方案）
  function setupSubmitListener() {
    console.log('🔍 开始设置 Submit 监听器');
    // 查找所有可能是 Submit 的按钮
    const submitButtons = document.querySelectorAll('button, input[type="submit"]');
    console.log(`找到 ${submitButtons.length} 个按钮`);
    
    submitButtons.forEach((button, index) => {
      const text = button.textContent || button.value || '';
      const isSubmit = text.includes('Submit') || text.includes('提交');
      const hasGradeCall = button.onclick && button.onclick.toString().includes('grade');
      
      console.log(`按钮 ${index}: "${text.trim()}", onclick: ${button.onclick ? button.onclick.toString().substring(0, 50) : 'none'}, isSubmit: ${isSubmit}, hasGradeCall: ${hasGradeCall}`);
      
      if (isSubmit && hasGradeCall) {
        console.log(`✅ 按钮 "${text.trim()}" 已经调用 grade()，不需要添加监听器`);
      } else if (isSubmit) {
        console.log(`⚠️ 按钮 "${text.trim()}" 没有调用 grade()，添加监听器`);
        button.addEventListener('click', function(e) {
          console.log('🔴 Submit button clicked (backup listener)');
          // 延迟执行，确保评分已完成
          setTimeout(() => {
            console.log('⚡ Sending data from backup listener');
            sendSubmitDataReal();
          }, 1000);
        });
      }
    });
  }

  // 页面加载完成后初始化
  function init() {
    console.log('🎯 DOM 加载完成，开始初始化');
    
    // 暴露真正的函数
    window._sendSubmitDataReal = sendSubmitDataReal;
    
    // 更新 sendSubmitData 为直接调用
    window.sendSubmitData = sendSubmitDataReal;
    
    console.log('✅ window.sendSubmitData 已定义为:', typeof window.sendSubmitData);
    
    setupSubmitListener();
    console.log('✅ iframe communication 初始化完成');
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
    console.log('⏳ 等待 DOMContentLoaded 事件');
  } else {
    console.log('✅ DOM 已经加载完成，立即初始化');
    init();
  }

  console.log('📦 iframe-communication.js 加载完成');
})();

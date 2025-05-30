/**
 * MCP Assistant for Firefox - Utility Functions
 * 공통 기능 및 유틸리티 함수 모음
 */

// 결과 상태 상수
const STATUS = {
  SUCCESS: 'success',
  ERROR: 'error'
};

/**
 * CSS 선택자를 정규화하는 함수
 * 멀티 선택자나 복잡한 선택자를 더 신뢰성 있게 처리
 * @param {string} selector - CSS 선택자
 * @return {string} 정규화된 선택자
 */
function normalizeSelector(selector) {
  if (!selector) return null;
  
  // 기본 공백 제거
  selector = selector.trim();
  
  // 잘못된 선택자 문자 제거 (특수문자 등)
  selector = selector.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
  
  // 따옴표 정규화 (따옴표가 짝을 이루도록)
  let doubleQuotes = (selector.match(/"/g) || []).length;
  let singleQuotes = (selector.match(/'/g) || []).length;
  
  if (doubleQuotes % 2 !== 0) {
    selector = selector.replace(/"/g, '\'');
  }
  
  if (singleQuotes % 2 !== 0) {
    selector = selector.replace(/'/g, '"');
  }
  
  try {
    // 유효성 검사 (테스트용 선택자 실행)
    document.querySelector(selector);
  } catch (e) {
    // 오류 발생 시 기본 안전한 버전으로 대체
    log('warn', 'utils', `Invalid selector normalized: ${selector}`, { error: e.message });
    
    // 간단한 선택자로 변환 시도 (ID, 클래스, 태그 등)
    if (selector.includes('#')) {
      selector = selector.split('#')[1].split(' ')[0];
      selector = '#' + selector.replace(/[^\w-]/g, '');
    } else if (selector.includes('.')) {
      selector = selector.split('.')[1].split(' ')[0];
      selector = '.' + selector.replace(/[^\w-]/g, '');
    } else {
      // 기본 요소 유형으로 가정
      selector = selector.split(' ')[0].replace(/[^\w-]/g, '');
    }
  }
  
  return selector;
}

/**
 * 표준화된 결과 객체 생성
 * @param {string} status - 'success' 또는 'error'
 * @param {*} data - 성공 시 결과 데이터
 * @param {string} [message] - 추가 메시지 (선택적)
 * @param {*} [error] - 오류 정보 (선택적)
 * @return {Object} 표준화된 결과 객체
 */
function createResult(status, data, message = '', error = null) {
  const result = {
    status,
    timestamp: new Date().toISOString(),
    data
  };
  
  if (message) result.message = message;
  if (error) result.error = error;
  
  return result;
}

/**
 * 표준화된 로깅 함수
 * @param {string} level - 로그 레벨 ('info', 'warn', 'error')
 * @param {string} source - 로그 소스 ('background', 'content', 'popup')
 * @param {string} message - 로그 메시지
 * @param {*} [data] - 추가 데이터 (선택적)
 */
function log(level, source, message, data = null) {
  const logEntry = {
    level,
    source,
    timestamp: new Date().toISOString(),
    message
  };
  
  if (data) logEntry.data = data;
  
  console[level](`[MCP-${source}]`, message, data ? data : '');
  
  return logEntry;
}

/**
 * 서버로 결과 전송
 * @param {Object} result - 전송할 결과 객체
 * @param {string} endpoint - 전송할 엔드포인트 URL
 * @return {Promise} 전송 결과 Promise
 */
function sendResultToServer(result, endpoint) {
  return fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(result)
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`Server response: ${response.status} ${response.statusText}`);
    }
    return response.json();
  })
  .catch(error => {
    log('error', 'utils', 'Failed to send result to server', { error: error.message, endpoint });
    throw error;
  });
}

/**
 * 명령 유효성 검사
 * @param {Object} command - 검사할 명령 객체
 * @return {Object} 유효성 검사 결과 {valid: boolean, errors: array}
 */
function validateCommand(command) {
  const errors = [];
  
  // 필수 필드 검사
  if (!command) {
    errors.push('Command object is missing');
    return { valid: false, errors };
  }
  
  // action 필드 검사
  if (!command.action) {
    errors.push('Action field is required');
  } else if (!['click', 'input', 'scroll', 'extract'].includes(command.action)) {
    errors.push(`Invalid action: ${command.action}. Must be one of: click, input, scroll, extract`);
  }
  
  // selector 필드 검사 (extract를 제외한 모든 action에 필수)
  if (command.action !== 'extract' && !command.selector) {
    errors.push(`Selector is required for action: ${command.action}`);
  }
  
  // input action에 대한 value 필드 검사
  if (command.action === 'input' && command.value === undefined) {
    errors.push('Value is required for input action');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// 모듈 내보내기
if (typeof module !== 'undefined') {
  module.exports = {
    STATUS,
    normalizeSelector,
    createResult,
    log,
    sendResultToServer,
    validateCommand
  };
}

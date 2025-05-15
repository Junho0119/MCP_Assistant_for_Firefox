/**
 * MCP Assistant for Firefox - Popup Script
 * 팝업 UI 기능 및 수동 테스트 인터페이스 제공
 */

// DOM 요소 참조
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const commandForm = document.getElementById('command-form');
const actionSelect = document.getElementById('action');
const selectorInput = document.getElementById('selector');
const valueGroup = document.getElementById('value-group');
const valueInput = document.getElementById('value');
const logPanel = document.getElementById('log-panel');

// MCP 서버 설정
const MCP_SERVER = 'http://localhost:3001';
const MCP_STATUS_ENDPOINT = `${MCP_SERVER}/api/status`;

// 상태 확인 간격 (2초)
const STATUS_CHECK_INTERVAL = 2000;

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', () => {
  // 액션 선택 변경 감지
  actionSelect.addEventListener('change', updateFormFields);
  
  // 폼 제출 처리
  commandForm.addEventListener('submit', handleCommandSubmit);
  
  // 초기 폼 필드 설정
  updateFormFields();
  
  // MCP 서버 상태 확인 시작
  checkServerStatus();
  setInterval(checkServerStatus, STATUS_CHECK_INTERVAL);
  
  // 현재 탭 정보 표시
  displayCurrentTab();
});

/**
 * 선택된 액션에 따라 폼 필드 표시/숨김 처리
 */
function updateFormFields() {
  const action = actionSelect.value;
  
  // input 액션일 때만 값 입력 필드 표시
  if (action === 'input') {
    valueGroup.style.display = 'block';
  } else {
    valueGroup.style.display = 'none';
  }
  
  // extract 액션일 때는 선택자 필드 선택적 처리
  if (action === 'extract') {
    selectorInput.placeholder = '선택 사항 (비워두면 전체 페이지)';
    document.querySelector('label[for="selector"]').textContent = '선택자 (선택 사항):';
  } else {
    selectorInput.placeholder = '예: #submit-button, .menu-item, h1';
    document.querySelector('label[for="selector"]').textContent = '선택자 (CSS selector):';
  }
}

/**
 * 명령 제출 처리
 * @param {Event} event - 제출 이벤트
 */
async function handleCommandSubmit(event) {
  event.preventDefault();
  
  // 현재 액티브 탭 가져오기
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tabs.length) {
    addLogEntry('error', '활성 탭을 찾을 수 없습니다.');
    return;
  }
  
  const tabId = tabs[0].id;
  const action = actionSelect.value;
  const selector = selectorInput.value;
  const value = valueInput.value;
  
  // 액션에 따른 유효성 검사
  if (action !== 'extract' && !selector) {
    addLogEntry('error', '선택자를 입력하세요.');
    return;
  }
  
  if (action === 'input' && !value) {
    addLogEntry('error', '입력 값을 입력하세요.');
    return;
  }
  
  // 명령 객체 생성
  const command = {
    action,
    tabId,
    selector
  };
  
  // 필요한 경우 추가 속성 설정
  if (action === 'input') {
    command.value = value;
  }
  
  // 명령 실행
  addLogEntry('info', `명령 실행: ${JSON.stringify(command)}`);
  
  try {
    // background 스크립트로 메시지 전송
    const result = await browser.runtime.sendMessage({
      type: 'EXECUTE_COMMAND',
      command
    });
    
    // 응답 처리
    if (result && result.status === STATUS.SUCCESS) {
      addLogEntry('info', `성공: ${result.message || '명령이 성공적으로 실행되었습니다.'}`);
    } else {
      addLogEntry('error', `실패: ${result?.message || '명령 실행 중 오류가 발생했습니다.'}`);
    }
  } catch (error) {
    addLogEntry('error', `오류: ${error.message}`);
  }
}

/**
 * MCP 서버 상태 확인
 */
async function checkServerStatus() {
  try {
    const response = await fetch(MCP_STATUS_ENDPOINT, { method: 'GET' });
    
    if (response.ok) {
      const data = await response.json();
      updateServerStatus(true, data.message || 'MCP 서버에 연결되었습니다.');
    } else {
      updateServerStatus(false, 'MCP 서버 응답 오류');
    }
  } catch (error) {
    updateServerStatus(false, 'MCP 서버에 연결할 수 없습니다.');
  }
}

/**
 * 서버 상태 UI 업데이트
 * @param {boolean} connected - 연결 상태
 * @param {string} message - 상태 메시지
 */
function updateServerStatus(connected, message) {
  statusIndicator.className = `status-indicator ${connected ? 'connected' : 'disconnected'}`;
  statusText.textContent = message;
}

/**
 * 로그 패널에 새 로그 추가
 * @param {string} level - 로그 레벨 ('info', 'warn', 'error')
 * @param {string} message - 로그 메시지
 */
function addLogEntry(level, message) {
  const entry = document.createElement('div');
  entry.className = `log-entry log-${level}`;
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  
  logPanel.appendChild(entry);
  logPanel.scrollTop = logPanel.scrollHeight;
}

/**
 * 현재 탭 정보 표시
 */
async function displayCurrentTab() {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs.length) {
      const tab = tabs[0];
      addLogEntry('info', `현재 탭: "${tab.title}"`);
      addLogEntry('info', `URL: ${tab.url}`);
    }
  } catch (error) {
    addLogEntry('error', `탭 정보 가져오기 오류: ${error.message}`);
  }
}

// 백그라운드 스크립트에서 오는 로그 메시지 수신
browser.runtime.onMessage.addListener((message) => {
  if (message.type === 'LOG') {
    addLogEntry(message.level, message.message);
  }
});

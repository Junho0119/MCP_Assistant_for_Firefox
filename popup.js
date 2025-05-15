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
const valueInput = document.getElementById('value');
const logPanel = document.getElementById('log-panel');
const resetButton = document.getElementById('reset-button');

// 액션별 필드 영역
const inputFields = document.getElementById('input-fields');
const scrollFields = document.getElementById('scroll-fields');
const extractFields = document.getElementById('extract-fields');

// 스크롤 옵션 필드
const scrollDirectionOptions = document.getElementById('scroll-direction-options');
const scrollPositionOptions = document.getElementById('scroll-position-options');
const scrollDirectionSelect = document.getElementById('scroll-direction');
const scrollTopInput = document.getElementById('scroll-top');
const scrollLeftInput = document.getElementById('scroll-left');

// 추출 옵션 필드
const extractHtmlCheckbox = document.getElementById('extract-html');
const extractAttributesCheckbox = document.getElementById('extract-attributes');
const extractStylesCheckbox = document.getElementById('extract-styles');
const extractAllCheckbox = document.getElementById('extract-all');

// 입력 옵션 필드
const inputSimulateTypingCheckbox = document.getElementById('input-simulate-typing');
const inputClearFirstCheckbox = document.getElementById('input-clear-first');

// MCP 서버 설정
const MCP_SERVER = 'http://localhost:3001';
const MCP_STATUS_ENDPOINT = `${MCP_SERVER}/api/status`;

// 상태 확인 간격 (2초)
const STATUS_CHECK_INTERVAL = 2000;

// 명령 히스토리
let commandHistory = [];
let currentHistoryIndex = -1;

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', () => {
  // 액션 선택 변경 감지
  actionSelect.addEventListener('change', updateFormFields);
  
  // 폼 제출 처리
  commandForm.addEventListener('submit', handleCommandSubmit);
  
  // 초기화 버튼
  resetButton.addEventListener('click', resetForm);
  
  // 스크롤 타입 변경 감지
  document.querySelectorAll('input[name="scroll-type"]').forEach(radio => {
    radio.addEventListener('change', updateScrollFields);
  });
  
  // 추출 타입 변경 감지
  document.querySelectorAll('input[name="extract-type"]').forEach(radio => {
    radio.addEventListener('change', updateExtractFields);
  });
  
  // 초기 폼 필드 설정
  setupCollapsibles();
  updateFormFields();
  
  // 저장된 설정 불러오기
  loadSettings();
  
  // MCP 서버 상태 확인 시작
  checkServerStatus();
  setInterval(checkServerStatus, STATUS_CHECK_INTERVAL);
  
  // 현재 탭 정보 표시
  displayCurrentTab();
});

/**
 * 접이식 요소 설정
 */
function setupCollapsibles() {
  const collapsibles = document.getElementsByClassName('collapsible');
  
  for (let i = 0; i < collapsibles.length; i++) {
    collapsibles[i].addEventListener('click', function() {
      this.classList.toggle('active');
      const content = this.nextElementSibling;
      
      if (content.style.maxHeight) {
        content.style.maxHeight = null;
      } else {
        content.style.maxHeight = content.scrollHeight + 'px';
      }
    });
  }
}

/**
 * 설정 저장 함수
 */
function saveSettings() {
  const settings = {
    action: actionSelect.value,
    inputSimulateTyping: inputSimulateTypingCheckbox.checked,
    inputClearFirst: inputClearFirstCheckbox.checked,
    scrollBehavior: document.querySelector('input[name="scroll-behavior"]:checked').value,
    extractHtml: extractHtmlCheckbox.checked,
    extractAttributes: extractAttributesCheckbox.checked,
    extractStyles: extractStylesCheckbox.checked,
    extractAll: extractAllCheckbox.checked,
    commandHistory: commandHistory
  };
  
  browser.storage.local.set({ settings });
}

/**
 * 설정 불러오기 함수
 */
async function loadSettings() {
  try {
    const stored = await browser.storage.local.get('settings');
    
    if (stored.settings) {
      const settings = stored.settings;
      
      // 기본 액션 설정
      actionSelect.value = settings.action || 'click';
      
      // 입력 옵션
      if (settings.inputSimulateTyping !== undefined) {
        inputSimulateTypingCheckbox.checked = settings.inputSimulateTyping;
      }
      
      if (settings.inputClearFirst !== undefined) {
        inputClearFirstCheckbox.checked = settings.inputClearFirst;
      }
      
      // 스크롤 옵션
      if (settings.scrollBehavior) {
        const scrollBehaviorRadio = document.querySelector(`input[name="scroll-behavior"][value="${settings.scrollBehavior}"]`);
        if (scrollBehaviorRadio) {
          scrollBehaviorRadio.checked = true;
        }
      }
      
      // 추출 옵션
      if (settings.extractHtml !== undefined) {
        extractHtmlCheckbox.checked = settings.extractHtml;
      }
      
      if (settings.extractAttributes !== undefined) {
        extractAttributesCheckbox.checked = settings.extractAttributes;
      }
      
      if (settings.extractStyles !== undefined) {
        extractStylesCheckbox.checked = settings.extractStyles;
      }
      
      if (settings.extractAll !== undefined) {
        extractAllCheckbox.checked = settings.extractAll;
      }
      
      // 명령 히스토리
      if (settings.commandHistory) {
        commandHistory = settings.commandHistory;
      }
      
      // UI 갱신
      updateFormFields();
    }
  } catch (error) {
    addLogEntry('error', `설정 불러오기 오류: ${error.message}`);
  }
}

/**
 * 선택된 액션에 따라 폼 필드 표시/숨김 처리
 */
function updateFormFields() {
  const action = actionSelect.value;
  
  // 모든 액션 필드 숨기기
  inputFields.style.display = 'none';
  scrollFields.style.display = 'none';
  extractFields.style.display = 'none';
  
  // 선택된 액션에 따라 필드 표시
  switch (action) {
    case 'input':
      inputFields.style.display = 'block';
      break;
    case 'scroll':
      scrollFields.style.display = 'block';
      updateScrollFields();
      break;
    case 'extract':
      extractFields.style.display = 'block';
      updateExtractFields();
      break;
  }
  
  // 선택자 필드 레이블 및 placeholder 업데이트
  if (action === 'extract' && document.querySelector('input[name="extract-type"]:checked').value === 'document') {
    selectorInput.placeholder = '선택 사항 (비워두면 전체 페이지)';
    document.querySelector('label[for="selector"]').textContent = '선택자 (선택 사항):';
  } else {
    selectorInput.placeholder = '예: #submit-button, .menu-item, h1';
    document.querySelector('label[for="selector"]').textContent = '선택자 (CSS selector):';
  }
}

/**
 * 스크롤 타입에 따른 필드 표시/숨김 처리
 */
function updateScrollFields() {
  const scrollType = document.querySelector('input[name="scroll-type"]:checked').value;
  
  // 스크롤 옵션 필드 초기화
  scrollDirectionOptions.style.display = 'none';
  scrollPositionOptions.style.display = 'none';
  
  // 선택된 스크롤 타입에 따라 필드 표시
  switch (scrollType) {
    case 'element':
      // 요소로 스크롤 - 추가 옵션 필요 없음
      break;
    case 'position':
      scrollPositionOptions.style.display = 'block';
      break;
    case 'direction':
      scrollDirectionOptions.style.display = 'block';
      break;
  }
}

/**
 * 추출 타입에 따른 필드 표시/숨김 처리
 */
function updateExtractFields() {
  const extractType = document.querySelector('input[name="extract-type"]:checked').value;
  
  // 문서 전체 추출 시 선택자 선택 사항
  if (extractType === 'document') {
    selectorInput.placeholder = '선택 사항 (비워두면 전체 페이지)';
    document.querySelector('label[for="selector"]').textContent = '선택자 (선택 사항):';
  } else {
    selectorInput.placeholder = '예: #submit-button, .menu-item, h1';
    document.querySelector('label[for="selector"]').textContent = '선택자 (CSS selector):';
  }
}

/**
 * 폼 초기화
 */
function resetForm() {
  selectorInput.value = '';
  valueInput.value = '';
  scrollTopInput.value = '';
  scrollLeftInput.value = '';
  
  // 라디오 버튼 초기화
  document.querySelector('input[name="scroll-type"][value="element"]').checked = true;
  document.querySelector('input[name="scroll-behavior"][value="smooth"]').checked = true;
  document.querySelector('input[name="extract-type"][value="element"]').checked = true;
  
  // 체크박스 초기화
  inputSimulateTypingCheckbox.checked = false;
  inputClearFirstCheckbox.checked = false;
  extractHtmlCheckbox.checked = false;
  extractAttributesCheckbox.checked = false;
  extractStylesCheckbox.checked = false;
  extractAllCheckbox.checked = false;
  
  // UI 갱신
  updateFormFields();
  
  addLogEntry('info', '폼이 초기화되었습니다.');
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
  
  // 액션에 따른 유효성 검사
  if (action !== 'extract' || (action === 'extract' && document.querySelector('input[name="extract-type"]:checked').value === 'element')) {
    if (!selector) {
      addLogEntry('error', '선택자를 입력하세요.');
      return;
    }
  }
  
  if (action === 'input' && !valueInput.value) {
    addLogEntry('error', '입력 값을 입력하세요.');
    return;
  }
  
  // 명령 객체 생성
  const command = {
    action,
    tabId,
    selector: selector || undefined
  };
  
  // 액션별 추가 속성 설정
  switch (action) {
    case 'input':
      command.value = valueInput.value;
      command.options = {
        simulateTyping: inputSimulateTypingCheckbox.checked,
        clearFirst: inputClearFirstCheckbox.checked
      };
      break;
    
    case 'scroll':
      const scrollType = document.querySelector('input[name="scroll-type"]:checked').value;
      const scrollBehavior = document.querySelector('input[name="scroll-behavior"]:checked').value;
      
      command.options = { behavior: scrollBehavior };
      
      if (scrollType === 'position') {
        if (scrollTopInput.value) {
          command.options.top = parseInt(scrollTopInput.value);
        }
        
        if (scrollLeftInput.value) {
          command.options.left = parseInt(scrollLeftInput.value);
        }
      } else if (scrollType === 'direction') {
        command.options.direction = scrollDirectionSelect.value;
      }
      
      // 요소 스크롤이 아니고 선택자가 비어있으면 제거
      if (scrollType !== 'element' && !selector) {
        delete command.selector;
      }
      break;
    
    case 'extract':
      const extractType = document.querySelector('input[name="extract-type"]:checked').value;
      
      command.options = {
        includeHtml: extractHtmlCheckbox.checked,
        includeAttributes: extractAttributesCheckbox.checked,
        includeStyles: extractStylesCheckbox.checked,
        extractAll: extractAllCheckbox.checked
      };
      
      // 문서 전체 추출인 경우 document로 설정
      if (extractType === 'document' && !selector) {
        command.selector = 'document';
      }
      break;
  }
  
  // 명령 히스토리에 추가
  commandHistory.unshift(command);
  if (commandHistory.length > 10) {
    commandHistory.pop();
  }
  currentHistoryIndex = -1;
  
  // 설정 저장
  saveSettings();
  
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
  
  // 로그 최대 개수 제한 (최대 50개)
  while (logPanel.childNodes.length > 50) {
    logPanel.removeChild(logPanel.firstChild);
  }
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

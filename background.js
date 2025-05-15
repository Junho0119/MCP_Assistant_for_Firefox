/**
 * MCP Assistant for Firefox - Background Script
 * MCP 서버와의 통신 및 명령 처리를 담당
 */

// MCP 서버 통신 설정
const MCP_SERVER = 'http://localhost:3001';
const MCP_RESULT_ENDPOINT = `${MCP_SERVER}/api/plugin-result`;
const MCP_COMMAND_ENDPOINT = `${MCP_SERVER}/api/plugin-command`;
const POLLING_INTERVAL = 1000; // 폴링 간격 (1초)

// 명령 대기열 및 실행 상태
let commandQueue = [];
let isProcessing = false;
let pollingIntervalId = null;
let lastCommandId = null;

// 확장 프로그램 시작 시 초기화
browser.runtime.onInstalled.addListener(() => {
  log('info', 'background', 'MCP Assistant for Firefox installed');
  startPolling();
});

// 연결 상태 확인 및 설정
browser.runtime.onStartup.addListener(() => {
  log('info', 'background', 'MCP Assistant for Firefox started');
  startPolling();
});

/**
 * MCP 서버로부터 명령을 폴링하는 함수
 * 주기적으로 서버에 새 명령이 있는지 확인
 */
function startPolling() {
  if (pollingIntervalId) {
    clearInterval(pollingIntervalId);
  }
  
  pollingIntervalId = setInterval(pollForCommands, POLLING_INTERVAL);
  log('info', 'background', 'Started polling for commands', { interval: POLLING_INTERVAL });
}

/**
 * 서버에 명령이 있는지 확인하는 폴링 함수
 */
function pollForCommands() {
  fetch(`${MCP_COMMAND_ENDPOINT}?lastId=${lastCommandId || ''}`)
    .then(response => {
      if (!response.ok) {
        throw new Error(`Server response: ${response.status} ${response.statusText}`);
      }
      return response.json();
    })
    .then(data => {
      if (data && data.command) {
        log('info', 'background', 'Received command from MCP server', data);
        lastCommandId = data.id || lastCommandId;
        processCommand(data.command);
      }
    })
    .catch(error => {
      // 연결 오류는 조용히 처리 (서버가 시작되지 않았을 수 있음)
      log('warn', 'background', 'Failed to poll for commands', { error: error.message });
    });
}

/**
 * 명령 처리 함수
 * @param {Object} command - 처리할 명령 객체
 */
function processCommand(command) {
  // 명령 유효성 검사
  const validation = validateCommand(command);
  if (!validation.valid) {
    const errorMessage = `Invalid command: ${validation.errors.join(', ')}`;
    log('error', 'background', errorMessage, { command });
    
    const result = createResult(STATUS.ERROR, null, errorMessage);
    sendResultToServer(result, MCP_RESULT_ENDPOINT);
    return;
  }
  
  // 명령을 대기열에 추가
  commandQueue.push(command);
  
  // 명령 처리가 진행 중이 아니면 처리 시작
  if (!isProcessing) {
    processNextCommand();
  }
}

/**
 * 대기열의 다음 명령을 처리하는 함수
 */
function processNextCommand() {
  if (commandQueue.length === 0) {
    isProcessing = false;
    return;
  }
  
  isProcessing = true;
  const command = commandQueue.shift();
  
  // 명령을 실행할 탭 결정
  const tabIdPromise = command.tabId 
    ? Promise.resolve(command.tabId) 
    : browser.tabs.query({ active: true, currentWindow: true })
        .then(tabs => tabs[0]?.id);
  
  tabIdPromise.then(tabId => {
    if (!tabId) {
      throw new Error('No active tab found');
    }
    
    // content script로 명령 전달
    return browser.tabs.sendMessage(tabId, {
      type: 'EXECUTE_COMMAND',
      command: command
    });
  })
  .then(result => {
    // 성공 결과 처리
    log('info', 'background', 'Command executed successfully', { command, result });
    return sendResultToServer(result, MCP_RESULT_ENDPOINT);
  })
  .catch(error => {
    // 오류 처리
    const errorMessage = error.message || 'Unknown error during command execution';
    log('error', 'background', errorMessage, { command, error });
    
    const result = createResult(STATUS.ERROR, null, errorMessage, {
      command,
      errorDetails: error.toString()
    });
    
    return sendResultToServer(result, MCP_RESULT_ENDPOINT);
  })
  .finally(() => {
    // 다음 명령 처리
    processNextCommand();
  });
}

/**
 * 확장 프로그램에서 받은 결과를 MCP 서버로 전송하는 메시지 핸들러
 */
browser.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'COMMAND_RESULT') {
    log('info', 'background', 'Received result from content script', { result: message.result });
    sendResultToServer(message.result, MCP_RESULT_ENDPOINT);
  }
  
  if (message.type === 'LOG') {
    log(message.level, message.source, message.message, message.data);
  }
});

// WebSocket을 사용한 통신을 위한 대체 기능 (필요시 활성화)
/*
function setupWebSocketConnection() {
  const socket = new WebSocket(`ws://${MCP_SERVER.replace('http://', '')}`);
  
  socket.onopen = () => {
    log('info', 'background', 'WebSocket connection established with MCP server');
  };
  
  socket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === 'COMMAND') {
        processCommand(message.command);
      }
    } catch (error) {
      log('error', 'background', 'Failed to parse WebSocket message', { 
        error: error.message, 
        data: event.data 
      });
    }
  };
  
  socket.onclose = () => {
    log('warn', 'background', 'WebSocket connection closed');
    // 재연결 로직
    setTimeout(setupWebSocketConnection, 5000);
  };
  
  socket.onerror = (error) => {
    log('error', 'background', 'WebSocket error', { error });
  };
  
  return socket;
}
*/

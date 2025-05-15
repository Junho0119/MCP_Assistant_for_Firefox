/**
 * MCP Assistant for Firefox - Background Script
 * MCP 서버와의 통신 및 명령 처리를 담당
 */

// MCP 서버 통신 설정
const MCP_SERVER = 'http://localhost:3001';
const MCP_RESULT_ENDPOINT = `${MCP_SERVER}/api/plugin-result`;
const MCP_COMMAND_ENDPOINT = `${MCP_SERVER}/api/plugin-command`;
const POLLING_INTERVAL = 1000; // 폴링 간격 (1초)
const MAX_RETRY_ATTEMPTS = 5; // 최대 재시도 횟수
let currentRetryCount = 0; // 현재 재시도 횟수

// 명령 대기열 및 실행 상태
let commandQueue = [];
let isProcessing = false;
let pollingIntervalId = null;
let lastCommandId = null;

// WebSocket 통신 설정
let socket = null;
let isWebSocketConnected = false;
let reconnectAttempts = 0;
const MAX_WEBSOCKET_RECONNECT = 5;
const WEBSOCKET_RECONNECT_DELAY = 5000; // 5초

// 확장 프로그램 시작 시 초기화
browser.runtime.onInstalled.addListener(() => {
  log('info', 'background', 'MCP Assistant for Firefox installed');
  
  // WebSocket 연결 시도
  setupWebSocketConnection();
  
  // 폴백으로 폴링 시작 (WebSocket 연결 실패 시 사용)
  if (!isWebSocketConnected) {
    startPolling();
  }
});

// 연결 상태 확인 및 설정
browser.runtime.onStartup.addListener(() => {
  log('info', 'background', 'MCP Assistant for Firefox started');
  
  // WebSocket 연결 시도
  setupWebSocketConnection();
  
  // 폴백으로 폴링 시작 (WebSocket 연결 실패 시 사용)
  setTimeout(() => {
    if (!isWebSocketConnected) {
      startPolling();
    }
  }, 2000); // 2초 대기 후 확인
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
  
  // 재시도 카운터 초기화
  currentRetryCount = 0;
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
      // 성공 시 재시도 카운터 초기화
      currentRetryCount = 0;
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
      // 연결 오류 처리 및 재연결 시도
      log('warn', 'background', 'Failed to poll for commands', { error: error.message, retryCount: currentRetryCount });
      
      // 폴링 중단하고 재시도 로직 수행
      if (pollingIntervalId) {
        clearInterval(pollingIntervalId);
        pollingIntervalId = null;
      }
      
      currentRetryCount++;
      
      // 재시도 횟수가 최대값 이하인 경우 재시도
      if (currentRetryCount <= MAX_RETRY_ATTEMPTS) {
        const retryDelay = Math.min(2000 * Math.pow(2, currentRetryCount - 1), 30000); // 지수 백오프
        log('info', 'background', `Retrying connection in ${retryDelay}ms (attempt ${currentRetryCount}/${MAX_RETRY_ATTEMPTS})`);
        
        setTimeout(() => {
          startPolling();
        }, retryDelay);
      } else {
        log('error', 'background', 'Max retry attempts reached. Please check the server.');
      }
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

/**
 * 서버로 결과 전송 (WebSocket 또는 HTTP)
 * @param {Object} result - 전송할 결과 객체
 * @param {string} endpoint - HTTP 전송 시 사용할 엔드포인트 URL
 * @returns {Promise} - 전송 결과 Promise
 */
function sendResultToServer(result, endpoint) {
  // WebSocket이 연결된 경우 WebSocket으로 결과 전송 시도
  if (isWebSocketConnected && socket && socket.readyState === WebSocket.OPEN) {
    try {
      socket.send(JSON.stringify({
        type: 'RESULT',
        result: result
      }));
      
      log('info', 'background', 'Result sent via WebSocket');
      return Promise.resolve({ success: true });
    } catch (wsError) {
      log('error', 'background', 'Failed to send result via WebSocket', { error: wsError.message });
      // WebSocket 전송 실패 시 HTTP로 대체
    }
  }
  
  // HTTP로 결과 전송 (WebSocket 사용 불가 또는 실패 시)
  return sendResultToServerWithRetry(result, endpoint);
}

/**
 * HTTP를 통해 결과를 전송하고 재시도하는 함수
 * @param {Object} result - 전송할 결과 객체
 * @param {string} endpoint - 엔드포인트 URL
 * @param {number} retryCount - 현재 재시도 횟수
 * @returns {Promise} - 전송 결과 Promise
 */
function sendResultToServerWithRetry(result, endpoint, retryCount = 0) {
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
    // 최대 재시도 횟수보다 적을 경우 재시도
    if (retryCount < 3) {
      const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 10000); // 지수 백오프
      log('warn', 'background', `Failed to send result, retrying in ${retryDelay}ms`, { error: error.message, retryCount });
      
      return new Promise(resolve => {
        setTimeout(() => {
          resolve(sendResultToServerWithRetry(result, endpoint, retryCount + 1));
        }, retryDelay);
      });
    }
    
    // 최대 재시도 횟수 초과 시 오류 발생
    log('error', 'background', 'Failed to send result after retries', { error: error.message });
    throw error;
  });
}

/**
 * WebSocket 연결 설정
 * 실시간 명령 전달 및 결과 수신을 위한 양방향 통신
 */
function setupWebSocketConnection() {
  // 이미 연결된 경우 무시
  if (socket && socket.readyState === WebSocket.OPEN) {
    return socket;
  }
  
  try {
    socket = new WebSocket(`ws://${MCP_SERVER.replace('http://', '')}/ws`);
    
    socket.onopen = () => {
      log('info', 'background', 'WebSocket connection established with MCP server');
      isWebSocketConnected = true;
      reconnectAttempts = 0;
      
      // 연결 성공 시 정보 전달
      socket.send(JSON.stringify({
        type: 'REGISTER',
        client: 'firefox-extension',
        version: '1.0.0',
        capabilities: ['click', 'input', 'scroll', 'extract']
      }));
      
      // 폴링 중지 (WebSocket 사용 시)
      if (pollingIntervalId) {
        clearInterval(pollingIntervalId);
        pollingIntervalId = null;
        log('info', 'background', 'Stopped polling (using WebSocket instead)');
      }
    };
    
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === 'COMMAND') {
          log('info', 'background', 'Received command via WebSocket', message);
          processCommand(message.command);
        } else if (message.type === 'PING') {
          // 핑 메시지 응답
          socket.send(JSON.stringify({ type: 'PONG', timestamp: new Date().toISOString() }));
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
      isWebSocketConnected = false;
      
      // 재연결 로직
      reconnectAttempts++;
      
      if (reconnectAttempts <= MAX_WEBSOCKET_RECONNECT) {
        log('info', 'background', `Attempting to reconnect WebSocket (${reconnectAttempts}/${MAX_WEBSOCKET_RECONNECT})...`);
        setTimeout(setupWebSocketConnection, WEBSOCKET_RECONNECT_DELAY);
      } else {
        log('error', 'background', 'Max WebSocket reconnect attempts reached, falling back to polling');
        // 폴링으로 대체
        startPolling();
      }
    };
    
    socket.onerror = (error) => {
      log('error', 'background', 'WebSocket error', { error });
      isWebSocketConnected = false;
    };
  } catch (error) {
    log('error', 'background', 'Failed to create WebSocket connection', { error: error.message });
    isWebSocketConnected = false;
    
    // 폴링으로 대체
    startPolling();
  }
  
  return socket;
}

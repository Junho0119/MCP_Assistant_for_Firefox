/**
 * MCP Assistant for Firefox - Content Script
 * 브라우저 DOM 조작 및 실제 명령 실행을 담당
 */

// 명령 실행자 객체 - 각 액션 타입별 처리 로직
const CommandExecutor = {
  /**
   * click 액션 수행
   * @param {string} selector - 클릭할 요소의 CSS 선택자
   * @return {Promise} 실행 결과 Promise
   */
  click: async function(selector) {
    const element = await this.waitForElement(selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }
    
    // 요소가 화면에 보이도록 스크롤
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // 잠시 대기하여 스크롤 완료 확인
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 클릭 이벤트 발생
    element.click();
    
    return createResult(STATUS.SUCCESS, {
      action: 'click',
      selector,
      elementInfo: this.getElementInfo(element)
    }, `Successfully clicked element: ${selector}`);
  },
  
  /**
   * input 액션 수행
   * @param {string} selector - 입력할 요소의 CSS 선택자
   * @param {string} value - 입력할 값
   * @return {Promise} 실행 결과 Promise
   */
  input: async function(selector, value) {
    const element = await this.waitForElement(selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }
    
    // contentEditable 요소 또는 input/textarea 구분
    if (element.isContentEditable) {
      element.focus();
      element.innerHTML = value;
      
      // 변경 이벤트 트리거
      const event = new Event('input', { bubbles: true });
      element.dispatchEvent(event);
    } else {
      // input, textarea 등의 요소
      element.focus();
      element.value = value;
      
      // 변경 이벤트 트리거
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
    
    return createResult(STATUS.SUCCESS, {
      action: 'input',
      selector,
      value,
      elementInfo: this.getElementInfo(element)
    }, `Successfully input value to element: ${selector}`);
  },
  
  /**
   * scroll 액션 수행
   * @param {string} selector - 스크롤할 요소의 CSS 선택자 (선택적)
   * @param {Object} options - 스크롤 옵션 (위치, 동작 등)
   * @return {Promise} 실행 결과 Promise
   */
  scroll: async function(selector, options = {}) {
    // 기본 옵션 설정
    const scrollOptions = {
      behavior: options.behavior || 'smooth',
      block: options.block || 'center',
      inline: options.inline || 'nearest',
      ...options
    };
    
    // 대상 요소 결정 (selector가 없으면 document.body로)
    let target;
    
    if (selector) {
      target = await this.waitForElement(selector);
      if (!target) {
        throw new Error(`Element not found: ${selector}`);
      }
      target.scrollIntoView(scrollOptions);
    } else {
      // 페이지 스크롤
      if (typeof options.top !== 'undefined' || typeof options.left !== 'undefined') {
        window.scrollTo({
          top: options.top || window.pageYOffset,
          left: options.left || window.pageXOffset,
          behavior: scrollOptions.behavior
        });
      } else if (options.direction === 'up') {
        window.scrollBy({ top: -500, behavior: scrollOptions.behavior });
      } else if (options.direction === 'down') {
        window.scrollBy({ top: 500, behavior: scrollOptions.behavior });
      } else {
        // 기본적으로 아래로 스크롤
        window.scrollBy({ top: 500, behavior: scrollOptions.behavior });
      }
    }
    
    // 현재 스크롤 위치 정보
    const scrollInfo = {
      pageXOffset: window.pageXOffset,
      pageYOffset: window.pageYOffset,
      scrollHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth
    };
    
    return createResult(STATUS.SUCCESS, {
      action: 'scroll',
      selector: selector || 'window',
      scrollInfo
    }, `Successfully scrolled ${selector ? 'to element: ' + selector : 'page'}`);
  },
  
  /**
   * extract 액션 수행 - 페이지에서 데이터 추출
   * @param {string} selector - 데이터를 추출할 요소의 CSS 선택자 (선택적)
   * @param {Object} options - 추출 옵션 
   * @return {Promise} 실행 결과 Promise
   */
  extract: async function(selector, options = {}) {
    let extractedData;
    
    // 전체 페이지 추출
    if (!selector || selector === 'document') {
      extractedData = {
        title: document.title,
        url: window.location.href,
        metaDescription: document.querySelector('meta[name="description"]')?.content || '',
        metaKeywords: document.querySelector('meta[name="keywords"]')?.content || '',
        h1: Array.from(document.querySelectorAll('h1')).map(el => el.textContent.trim()),
        text: document.body.innerText.substring(0, 5000) // 텍스트 길이 제한
      };
    } else {
      // 특정 선택자 추출
      const elements = Array.from(document.querySelectorAll(selector));
      
      if (elements.length === 0) {
        throw new Error(`No elements found matching selector: ${selector}`);
      }
      
      if (elements.length === 1 && !options.extractAll) {
        // 단일 요소 추출
        const element = elements[0];
        extractedData = this.getElementData(element);
      } else {
        // 여러 요소 목록 추출
        extractedData = elements.map((element, index) => ({
          index,
          ...this.getElementData(element, options)
        }));
      }
    }
    
    return createResult(STATUS.SUCCESS, {
      action: 'extract',
      selector: selector || 'document',
      data: extractedData
    }, `Successfully extracted data from ${selector || 'page'}`);
  },
  
  /**
   * 요소 정보 추출 헬퍼 함수
   * @param {Element} element - 정보를 추출할 DOM 요소
   * @param {Object} options - 추출 옵션
   * @return {Object} 요소 데이터
   */
  getElementData: function(element, options = {}) {
    const data = {
      tagName: element.tagName.toLowerCase(),
      textContent: element.textContent.trim()
    };
    
    // 요소 유형에 따른 추가 정보
    if (element.tagName === 'A') {
      data.href = element.href;
      data.target = element.target;
    } else if (element.tagName === 'IMG') {
      data.src = element.src;
      data.alt = element.alt;
    } else if (['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)) {
      data.value = element.value;
      data.name = element.name;
      data.type = element.type;
      data.placeholder = element.placeholder;
    } else if (element.tagName === 'TABLE') {
      // 테이블 데이터 추출
      data.tableData = this.extractTableData(element);
    }
    
    // 옵션에 따른 HTML 추출
    if (options.includeHtml) {
      data.outerHTML = element.outerHTML;
      data.innerHTML = element.innerHTML;
    }
    
    // 옵션에 따른 속성 추출
    if (options.includeAttributes) {
      data.attributes = {};
      for (const attr of element.attributes) {
        data.attributes[attr.name] = attr.value;
      }
    }
    
    return data;
  },
  
  /**
   * 테이블 데이터 추출 함수
   * @param {Element} tableElement - 테이블 DOM 요소
   * @return {Object} 테이블 데이터
   */
  extractTableData: function(tableElement) {
    const headers = [];
    const rows = [];
    
    // 헤더 추출
    const headerRow = tableElement.querySelector('thead tr');
    if (headerRow) {
      for (const cell of headerRow.querySelectorAll('th, td')) {
        headers.push(cell.textContent.trim());
      }
    }
    
    // 행 데이터 추출
    const bodyRows = tableElement.querySelectorAll('tbody tr');
    for (const row of bodyRows) {
      const rowData = [];
      for (const cell of row.querySelectorAll('td')) {
        rowData.push(cell.textContent.trim());
      }
      rows.push(rowData);
    }
    
    return { headers, rows };
  },
  
  /**
   * 요소의 기본 정보 추출
   * @param {Element} element - 정보를 추출할 DOM 요소
   * @return {Object} 요소 기본 정보
   */
  getElementInfo: function(element) {
    return {
      tagName: element.tagName.toLowerCase(),
      id: element.id,
      className: element.className,
      textContent: element.textContent.trim().substring(0, 100)
    };
  },
  
  /**
   * 선택자로 요소를 찾고 일정 시간 대기하는 함수
   * @param {string} selector - 찾을 요소의 CSS 선택자
   * @param {number} timeout - 최대 대기 시간 (ms)
   * @return {Promise<Element>} 찾은 요소
   */
  waitForElement: function(selector, timeout = 5000) {
    return new Promise((resolve) => {
      // 이미 존재하는 요소 확인
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }
      
      // 타임아웃 설정
      const timeoutId = setTimeout(() => {
        observer.disconnect();
        resolve(null); // 타임아웃시 null 반환
      }, timeout);
      
      // DOM 변경 감시
      const observer = new MutationObserver((mutations, obs) => {
        const element = document.querySelector(selector);
        if (element) {
          obs.disconnect();
          clearTimeout(timeoutId);
          resolve(element);
        }
      });
      
      // 옵저버 시작
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    });
  }
};

// 명령 메시지 리스너 설정
browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  // 명령 실행 메시지 처리
  if (message.type === 'EXECUTE_COMMAND') {
    log('info', 'content', 'Received command to execute', { command: message.command });
    
    try {
      const command = message.command;
      let result;
      
      switch (command.action) {
        case 'click':
          result = await CommandExecutor.click(command.selector);
          break;
        case 'input':
          result = await CommandExecutor.input(command.selector, command.value);
          break;
        case 'scroll':
          result = await CommandExecutor.scroll(command.selector, command.options);
          break;
        case 'extract':
          result = await CommandExecutor.extract(command.selector, command.options);
          break;
        default:
          result = createResult(STATUS.ERROR, null, `Unknown action: ${command.action}`);
      }
      
      // background script로 결과 전송
      browser.runtime.sendMessage({
        type: 'COMMAND_RESULT',
        result
      });
      
      return result;
    } catch (error) {
      const errorMessage = error.message || 'Unknown error';
      log('error', 'content', errorMessage, { command: message.command, error });
      
      const result = createResult(STATUS.ERROR, null, errorMessage, {
        command: message.command,
        stack: error.stack
      });
      
      // background script로 오류 전송
      browser.runtime.sendMessage({
        type: 'COMMAND_RESULT',
        result
      });
      
      return result;
    }
  }
});

// 페이지 로드 완료 시 알림
window.addEventListener('load', () => {
  log('info', 'content', 'Page loaded', { url: window.location.href, title: document.title });
});

// 로그 메시지 전송 함수
function sendLog(level, message, data = null) {
  browser.runtime.sendMessage({
    type: 'LOG',
    level,
    source: 'content',
    message,
    data
  });
}

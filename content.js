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
    
    // 요소가 클릭 가능한지 확인
    const isClickable = this.isElementClickable(element);
    if (!isClickable.clickable) {
      log('warn', 'content', `Element might not be clickable: ${isClickable.reason}`, { selector });
    }
    
    // 다양한 이벤트 시뮬레이션 시도
    try {
      // 1. 기본 클릭 시도
      element.click();
    } catch (error) {
      log('warn', 'content', `Basic click failed, trying alternative methods: ${error.message}`, { selector });
      
      try {
        // 2. 마우스 이벤트 시뮬레이션
        this.simulateMouseEvents(element);
      } catch (mouseError) {
        log('warn', 'content', `Mouse events simulation failed: ${mouseError.message}`, { selector });
        
        // 3. JavaScript 이벤트 핸들러 직접 호출 시도
        this.executeClickHandlers(element);
      }
    }
    
    // 짧은 지연으로 DOM 업데이트 대기
    await new Promise(resolve => setTimeout(resolve, 300));
    
    return createResult(STATUS.SUCCESS, {
      action: 'click',
      selector,
      elementInfo: this.getElementInfo(element)
    }, `Successfully clicked element: ${selector}`);
  },
  
  /**
   * 요소가 클릭 가능한지 확인
   * @param {Element} element - 확인할 요소
   * @return {Object} 클릭 가능 여부와 사유
   */
  isElementClickable: function(element) {
    if (!element) {
      return { clickable: false, reason: 'Element does not exist' };
    }
    
    // 요소나 부모가 disabled인지 확인
    if (element.disabled) {
      return { clickable: false, reason: 'Element is disabled' };
    }
    
    // 표시 여부 확인
    const style = window.getComputedStyle(element);
    if (style.display === 'none') {
      return { clickable: false, reason: 'Element is not displayed (display: none)' };
    }
    
    if (style.visibility === 'hidden') {
      return { clickable: false, reason: 'Element is not visible (visibility: hidden)' };
    }
    
    if (parseFloat(style.opacity) === 0) {
      return { clickable: false, reason: 'Element is transparent (opacity: 0)' };
    }
    
    // 크기 확인
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return { clickable: false, reason: 'Element has zero width or height' };
    }
    
    // 다른 요소에 가려져 있는지 확인은 복잡하여 생략
    
    return { clickable: true, reason: '' };
  },
  
  /**
   * 마우스 이벤트 시퀀스 시뮬레이션
   * @param {Element} element - 대상 요소
   */
  simulateMouseEvents: function(element) {
    const eventSequence = [
      'mouseenter',
      'mouseover',
      'mousedown',
      'mouseup',
      'click'
    ];
    
    for (const eventType of eventSequence) {
      const event = new MouseEvent(eventType, {
        view: window,
        bubbles: true,
        cancelable: true,
        buttons: 1  // 왼쪽 마우스 버튼
      });
      
      element.dispatchEvent(event);
    }
  },
  
  /**
   * 요소에 연결된 클릭 핸들러 실행 시도
   * @param {Element} element - 대상 요소
   */
  executeClickHandlers: function(element) {
    // 요소 onclick 속성 확인
    if (typeof element.onclick === 'function') {
      element.onclick();
      return;
    }
    
    // 부모 요소들까지 찾아보기
    let parent = element.parentElement;
    let depth = 0;
    
    while (parent && depth < 3) {  // 최대 3레벨까지만 확인
      if (typeof parent.onclick === 'function') {
        parent.onclick();
        return;
      }
      parent = parent.parentElement;
      depth++;
    }
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
    
    // 요소가 화면에 보이도록 스크롤
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await new Promise(resolve => setTimeout(resolve, 300));
    
    try {
      // 포커스 설정
      element.focus();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // contentEditable 요소 또는 input/textarea 구분
      if (element.isContentEditable) {
        // contentEditable 요소 (리치 텍스트 에디터 등)
        element.innerHTML = '';
        
        // 문자 하나씩 입력 (더 자연스러운 입력)
        for (let i = 0; i < value.length; i++) {
          const char = value.charAt(i);
          
          // 키보드 이벤트 시뮬레이션
          this.simulateKeyInput(element, char);
          
          // 짧은 지연 (자연스러운 타이핑 효과)
          if (i % 3 === 0) {
            await new Promise(resolve => setTimeout(resolve, 10));
          }
        }
        
        // 변경 이벤트 트리거
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        // 일반 입력 요소 (input, textarea 등)
        
        // 기존 내용 지우기
        element.value = '';
        element.dispatchEvent(new Event('input', { bubbles: true }));
        
        // 새 값 설정 (선택적으로 문자별 입력)
        if (value.length > 20) {
          // 긴 텍스트는 한 번에 설정
          element.value = value;
          element.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          // 짧은 텍스트는 문자별 입력
          for (let i = 0; i < value.length; i++) {
            element.value += value.charAt(i);
            element.dispatchEvent(new Event('input', { bubbles: true }));
            
            if (i % 3 === 0) {
              await new Promise(resolve => setTimeout(resolve, 10));
            }
          }
        }
        
        // 최종 변경 이벤트 트리거
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }
      
      // 포커스 해제
      element.blur();
    } catch (error) {
      log('warn', 'content', `Natural input failed, using direct assignment: ${error.message}`, { selector });
      
      // 실패 시 직접 할당 시도
      if (element.isContentEditable) {
        element.innerHTML = value;
      } else {
        element.value = value;
      }
      
      // 이벤트 트리거
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
   * 키보드 입력 시뮬레이션
   * @param {Element} element - 대상 요소
   * @param {string} char - 입력할 문자
   */
  simulateKeyInput: function(element, char) {
    const keyEvents = [
      new KeyboardEvent('keydown', {
        key: char,
        code: `Key${char.toUpperCase()}`,
        bubbles: true,
        cancelable: true
      }),
      new KeyboardEvent('keypress', {
        key: char,
        code: `Key${char.toUpperCase()}`,
        bubbles: true,
        cancelable: true
      }),
      new InputEvent('beforeinput', {
        inputType: 'insertText',
        data: char,
        bubbles: true,
        cancelable: true
      }),
      new InputEvent('input', {
        inputType: 'insertText',
        data: char,
        bubbles: true,
        cancelable: true
      }),
      new KeyboardEvent('keyup', {
        key: char,
        code: `Key${char.toUpperCase()}`,
        bubbles: true,
        cancelable: true
      })
    ];
    
    keyEvents.forEach(event => element.dispatchEvent(event));
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
    
    // 스크롤 애니메이션 완료 대기
    if (scrollOptions.behavior === 'smooth') {
      await new Promise(resolve => setTimeout(resolve, 500));
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
        extractedData = this.getElementData(element, options);
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
    
    // 계산된 스타일 추출 (옵션)
    if (options.includeStyles) {
      data.styles = {};
      const computedStyle = window.getComputedStyle(element);
      
      // 중요한 스타일 속성만 추출
      const importantStyles = [
        'display', 'visibility', 'position', 'width', 'height',
        'color', 'background-color', 'font-size', 'font-weight'
      ];
      
      for (const style of importantStyles) {
        data.styles[style] = computedStyle.getPropertyValue(style);
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
  waitForElement: function(selector, timeout = 10000) {
    return new Promise((resolve) => {
      // 이미 존재하는 요소 확인 (고급 쿼리 사용)
      const element = this.querySelector(selector);
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
        const element = this.querySelector(selector);
        if (element) {
          obs.disconnect();
          clearTimeout(timeoutId);
          resolve(element);
        }
      });
      
      // 옵저버 시작
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true
      });
    });
  },
  
  /**
   * 고급 선택자 쿼리 - Shadow DOM 및 iframe 지원
   * @param {string} selector - CSS 선택자
   * @return {Element} 찾은 요소 또는 null
   */
  querySelector: function(selector) {
    // 일반 DOM 먼저 시도
    let element = document.querySelector(selector);
    if (element) return element;
    
    // Shadow DOM 검색
    element = this.querySelectorInShadowDOM(document.body, selector);
    if (element) return element;
    
    // iframe 검색
    return this.querySelectorInIframes(selector);
  },
  
  /**
   * Shadow DOM 내에서 요소 검색
   * @param {Element} root - 검색 시작 요소
   * @param {string} selector - CSS 선택자
   * @return {Element} 찾은 요소 또는 null
   */
  querySelectorInShadowDOM: function(root, selector) {
    if (!root) return null;
    
    // 현재 노드의 shadowRoot 확인
    if (root.shadowRoot) {
      const element = root.shadowRoot.querySelector(selector);
      if (element) return element;
      
      // shadowRoot 내부의 모든 요소 검색
      const childElements = Array.from(root.shadowRoot.querySelectorAll('*'));
      for (const child of childElements) {
        const found = this.querySelectorInShadowDOM(child, selector);
        if (found) return found;
      }
    }
    
    // 자식 요소 재귀 검색
    const children = Array.from(root.querySelectorAll('*'));
    for (const child of children) {
      const found = this.querySelectorInShadowDOM(child, selector);
      if (found) return found;
    }
    
    return null;
  },
  
  /**
   * iframe 내에서 요소 검색
   * @param {string} selector - CSS 선택자
   * @return {Element} 찾은 요소 또는 null
   */
  querySelectorInIframes: function(selector) {
    try {
      const iframes = document.querySelectorAll('iframe');
      
      for (const iframe of iframes) {
        try {
          // iframe 접근이 보안 정책으로 제한될 수 있음
          const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
          
          // iframe 내 직접 검색
          const element = iframeDoc.querySelector(selector);
          if (element) return element;
          
          // iframe 내 shadow DOM 검색
          const shadowElement = this.querySelectorInShadowDOM(iframeDoc.body, selector);
          if (shadowElement) return shadowElement;
          
          // 중첩 iframe 검색 (재귀)
          const nestedElement = this.querySelectorInIframes(selector);
          if (nestedElement) return nestedElement;
        } catch (e) {
          // 크로스 도메인 오류는 무시 (동일 출처 정책으로 인한 제한)
          continue;
        }
      }
    } catch (e) {
      log('error', 'content', 'Error searching iframes', { error: e.message });
    }
    
    return null;
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

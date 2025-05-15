# MCP Assistant for Firefox

Firefox 브라우저를 통해 Claude가 웹 상호작용을 수행할 수 있도록 하는 확장 프로그램입니다. MCP(Model Context Protocol) 서버와 통신하여 브라우저 제어 명령을 받고 실행 결과를 반환합니다.

## 기능

- **브라우저 조작**: 클릭, 텍스트 입력, 스크롤 등의 기본 인터랙션 수행
- **데이터 추출**: 웹 페이지에서 정보 추출 및 구조화
- **Shadow DOM 지원**: Shadow DOM 및 iframe 내부 요소 접근
- **실시간 통신**: WebSocket을 사용한 양방향 실시간 통신 (HTTP 폴링 대체)
- **고급 DOM 탐색**: 복잡한 웹 애플리케이션에서도 요소 탐색 및 상호작용
- **오류 복구**: 네트워크 오류, 요소 찾기 실패 등의 상황에 대한 자동 복구

## 시스템 요구사항

- Firefox 브라우저 (버전 85 이상 권장)
- Node.js가 설치된 환경
- Local MCP 서버 (백엔드 API 엔드포인트 제공)

## 설치 방법

### 개발 모드 설치

1. 이 저장소를 클론합니다:
   ```
   git clone https://github.com/yourusername/MCP_Assistant_for_Firefox.git
   ```

2. Firefox 브라우저에서 "about:debugging" 페이지로 이동합니다.

3. "이 Firefox" 탭을 클릭합니다.

4. "임시 부가 기능 로드" 버튼을 클릭합니다.

5. 클론한 저장소에서 `manifest.json` 파일을 선택합니다.

### Local MCP 서버 설정

1. Local MCP 서버 저장소를 클론합니다.

2. 서버를 실행합니다:
   ```
   cd local-mcp-server
   npm install
   npm start
   ```

3. 서버가 `http://localhost:3001`에서 실행되고 있는지 확인합니다.

## 사용 방법

### 수동 테스트

1. Firefox 툴바에서 MCP Assistant 아이콘을 클릭하여 팝업 UI를 엽니다.

2. 다음 액션 중 하나를 선택합니다:
   - **클릭 (click)**: 요소를 클릭합니다
   - **입력 (input)**: 텍스트를 입력합니다
   - **스크롤 (scroll)**: 페이지 또는 요소를 스크롤합니다
   - **데이터 추출 (extract)**: 페이지 또는 요소에서 데이터를 추출합니다

3. CSS 선택자와 필요한 옵션을 입력합니다.

4. "명령 실행" 버튼을 클릭합니다.

### Claude와 함께 사용

1. Claude와 대화할 때 브라우저 제어 요청을 자연어로 표현합니다.

2. Claude가 요청을 해석하여 MCP 서버로 명령을 전송합니다.

3. MCP 서버는 명령을 Firefox 확장 프로그램으로 전달합니다.

4. 확장 프로그램이 명령을 실행하고 결과를 MCP 서버를 통해 Claude에게 반환합니다.

5. Claude가 실행 결과를 기반으로 응답합니다.

## 통신 프로토콜

### HTTP 통신

- **명령 수신**: `GET /api/plugin-command`
- **결과 전송**: `POST /api/plugin-result`

### WebSocket 통신

- **연결 주소**: `ws://localhost:3001/ws`
- **메시지 유형**:
  - `REGISTER`: 확장 프로그램 등록
  - `COMMAND`: 명령 수신
  - `RESULT`: 결과 전송
  - `PING`/`PONG`: 연결 상태 확인

## 프로젝트 구조

```
MCP_Assistant_for_Firefox/
├── background.js     - MCP 서버와 통신, 명령 수신 처리
├── content.js        - 브라우저 DOM 제어 실행
├── icons/            - 확장 프로그램 아이콘 리소스
├── manifest.json     - 확장 프로그램 메타 정보 및 권한 설정
├── popup.html        - 확장 프로그램 팝업 UI
├── popup.js          - 팝업 UI 기능 및 수동 테스트
└── utils.js          - 공통 유틸리티 함수
```

## 주요 명령 형식

### 클릭 명령
```json
{
  "action": "click",
  "selector": "#submit-button",
  "options": {
    "waitForVisible": true
  }
}
```

### 입력 명령
```json
{
  "action": "input",
  "selector": "#search-input",
  "value": "검색어",
  "options": {
    "simulateTyping": true,
    "clearFirst": true
  }
}
```

### 스크롤 명령
```json
{
  "action": "scroll",
  "selector": ".results-container",
  "options": {
    "behavior": "smooth",
    "direction": "down"
  }
}
```

### 데이터 추출 명령
```json
{
  "action": "extract",
  "selector": ".product-card",
  "options": {
    "includeHtml": false,
    "includeAttributes": true,
    "extractAll": true
  }
}
```

## 고급 기능

### Shadow DOM 내 요소 접근
Shadow DOM에 포함된 요소에 접근할 수 있습니다. 예를 들어:

```javascript
// 일반 DOM 선택자로 접근할 수 없는 Shadow DOM 내 요소에 접근
const element = CommandExecutor.querySelector('custom-element >>> .inner-button');
```

### iframes 내 요소 조작
iframe 내부의 요소도 조작할 수 있습니다:

```javascript
// iframe 내부의 요소 클릭
await CommandExecutor.click('iframe#content >>> .submit-button');
```

### 요소 대기 전략
요소가 나타날 때까지 지능적으로 대기합니다:

```javascript
const element = await CommandExecutor.waitForElement('.dynamic-content', {
  timeout: 10000,
  visible: true,
  enabled: true
});
```

## 오류 처리

확장 프로그램은 다음과 같은 오류 상황을 자동으로 처리합니다:

1. **요소를 찾을 수 없음**: 요소가 나타날 때까지 지정된 시간 동안 대기
2. **네트워크 오류**: 지수 백오프 방식으로 자동 재시도
3. **클릭 불가능한 요소**: 다양한 클릭 방법 시도 (JS click(), 이벤트 시뮬레이션)
4. **WebSocket 연결 끊김**: 자동 재연결 및 HTTP 폴링으로 대체

## 개발 로드맵

### 완료된 기능
- ✅ 기본 브라우저 제어 (click, input, scroll, extract)
- ✅ Shadow DOM 및 iframe 내부 요소 접근
- ✅ 요소 대기 및 동적 페이지 처리
- ✅ WebSocket 연결 구현
- ✅ 오류 처리 및 복구 메커니즘
- ✅ 고급 UI 옵션 추가

### 향후 계획
- ⬜ 드래그 앤 드롭 지원
- ⬜ 파일 업로드 지원
- ⬜ 키보드 단축키 및 조합키 시뮬레이션
- ⬜ 페이지 상태 변화 감지
- ⬜ 테스트 자동화 스크립트
- ⬜ manifest v3 마이그레이션

## 보안 고려사항

이 확장 프로그램은 웹 페이지에 대한 광범위한 접근 권한을 가지므로 다음 사항을 고려해야 합니다:

- 권한은 필요한 최소 범위로 제한됩니다.
- 민감한 웹사이트에서는 주의하여 사용하세요.
- 확장 프로그램에 전달되는 명령을 신뢰할 수 있는 소스에서만 받아들이도록 설정하세요.

## 라이선스

MIT 라이선스에 따라 배포됩니다. 자세한 내용은 LICENSE 파일을 참조하세요.

## 기여 방법

1. 이 저장소를 포크합니다.
2. 새 기능 브랜치를 생성합니다: `git checkout -b feature/amazing-feature`
3. 변경 사항을 커밋합니다: `git commit -m 'Add some amazing feature'`
4. 브랜치에 푸시합니다: `git push origin feature/amazing-feature`
5. Pull Request를 제출합니다.

## 문의

버그 리포트나 기능 요청은 이슈 트래커를 통해 제출해 주세요.

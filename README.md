# THE ONE CRANE SPARE

## 배포 개요
- 정적 프런트엔드는 public/ 디렉터리에 포함되어 있습니다.
- 서버 로직은 server.js 와 shared/ 에 있습니다.
- 가비아 업로드용 패키지는 npm run pack:gabia 로 생성할 수 있습니다.

## 실행
```bash
npm install
npm start
```

## 테스트
```bash
node --test test/*.test.js
```

## 가비아 업로드
```powershell
npm run pack:gabia
powershell -ExecutionPolicy Bypass -File .\scripts\upload-gabia-nozip.ps1 -FtpHost <host> -User <user>
```

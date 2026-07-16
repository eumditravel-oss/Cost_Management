# 현장 원가관리 시스템 웹 애플리케이션

## 개발 명령

```bash
npm run dev
npm run lint
npm run typecheck
npm run test
npm run build
npm run format:check
```

## 환경변수

`.env.example`을 참고해 로컬 전용 `.env.local`에 `DATABASE_URL`을 설정합니다. 실제 비밀번호·계좌정보·개인정보는 저장소에 넣지 않습니다.

## 데이터베이스

- PostgreSQL과 Drizzle 연결 골격은 구성되어 있습니다.
- 도메인 테이블과 실행 가능한 첫 마이그레이션은 데이터 모델 확정 및 PostgreSQL 연결 정보 승인 후 생성합니다.
- `npm run db:generate`, `npm run db:migrate`는 `DATABASE_URL`이 설정된 상태에서만 실행합니다.

## 점검 경로

- `GET /api/health`: 앱 상태와 DB 연결 문자열 설정 여부만 반환합니다. 비밀값은 반환하지 않습니다.

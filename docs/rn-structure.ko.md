# React Native 앱 구조 — Next.js 개발자 기준으로

이 lab 앱(Expo SDK 58 · RN 0.88 · Hermes)을 예로, Next.js App Router 와 대응시켜 정리한다.

## 1. 한 장 요약

```
 ┌───────────────── 내 코드 (TypeScript) ─────────────────┐
 │  src/app/*.tsx  ← 화면 (expo-router, 파일 = 라우트)       │
 │  src/lib/*      ← 클라이언트 · 상태 · 유틸                  │
 └───────────────▲─────────────────────────────────────────┘
                 │ Metro 가 번들링 (webpack/turbopack 역할)
 ┌───────────────┴──── JS 엔진: Hermes ─────────────────────┐
 │  React 가 "View/Text" 트리를 만든다 (DOM 이 아님)            │
 └───────────────▲─────────────────────────────────────────┘
                 │ JSI (C++ 다리) — 동기 호출 가능
 ┌───────────────┴──── 네이티브 (iOS · Android) ─────────────┐
 │  UIView / android.view 로 실제 화면을 그림 (Fabric 렌더러)    │
 │  AsyncStorage · AppState · 네트워크 · 카메라 = 네이티브 모듈  │
 └─────────────────────────────────────────────────────────┘
```

핵심 차이: **브라우저가 없다.** `document`, `window.addEventListener`, `localStorage`, CSS 파일이 없고,
그 자리를 네이티브 모듈이 채운다. 이 lab 이 #2613 을 "RN 에는 해당 없음"으로 판정한 근거가 바로 이것이다
(`typeof window.addEventListener === "undefined"`).

## 2. Next.js ↔ React Native 대응표

| Next.js (App Router) | React Native (Expo) | 이 lab 에서 |
|---|---|---|
| `app/layout.tsx` | `src/app/_layout.tsx` | Stack 네비게이터 |
| `app/page.tsx` | `src/app/index.tsx` | 홈 화면 |
| `app/refresh/page.tsx` | `src/app/refresh.tsx` | 파일 하나 = 화면 하나 |
| `(group)` 라우트 그룹 | `(tabs)` 같은 그룹 폴더 | 안 씀 |
| `<Link href>` · `useSearchParams` | `<Link href>` · `useLocalSearchParams` | 딥링크 `?auto=1` 처리 |
| 브라우저 히스토리 | Stack (화면이 위로 쌓임) | 뒤로가기 = pop |
| `<div>` `<span>` `<button>` | `<View>` `<Text>` `<Pressable>` | `components/button.tsx` |
| CSS · Tailwind | `StyleSheet.create({...})` (Flexbox 기본) | 기본 방향이 column |
| webpack / turbopack | Metro | `npx expo start` |
| V8 (브라우저 · Node) | Hermes (앱 안에 내장된 엔진) | env 로그 `engine: Hermes` |
| `localStorage` | AsyncStorage (비동기!) | Supabase 세션 저장소 |
| `visibilitychange` | `AppState` (`active` · `background`) | 자동 갱신 on/off |
| URL | 딥링크 (`exp://…/--/realtime`) | `scripts/cold-start.sh` |
| `.env` 의 `NEXT_PUBLIC_*` | `.env` 의 `EXPO_PUBLIC_*` | Supabase URL · 키 |
| `next build` → 서버 배포 | 앱 바이너리 빌드 → 스토어 심사 | EAS Build |
| 새로고침 | 앱 종료 후 재실행 = **콜드 스타트** | #1730 재현 조건 |

## 3. 앱이 켜질 때 일어나는 일 (콜드 스타트)

```
① 앱 아이콘 탭
② 네이티브 쪽 시작 → Hermes 엔진 기동
③ JS 번들 실행: 모듈 최상단 코드가 이때 돈다
     src/lib/supabase.ts → createClient()
       └ 세션 복원을 "시작"만 함 (AsyncStorage 읽기는 비동기)
④ 첫 화면 렌더 → useEffect 실행 → 채널 subscribe()
⑤ 세션 복원 완료 → SIGNED_IN · INITIAL_SESSION 이벤트
```

④ 가 ⑤ 보다 먼저 끝나면, Realtime 채널은 **토큰 없이** 서버에 join 한다.
세션 복원은 어느 플랫폼이든 비동기라 웹에서도 생길 수 있다 (이슈 댓글에 웹 사례가 있다). RN 은 저장소 자체가 비동기(AsyncStorage)라 이 틈이 확실히 생긴다.
→ 이것이 #1730. lab 의 `fresh-client` 모드가 정확히 ③ ~ ④ 를 재현한다.

## 4. 앱이 백그라운드로 갈 때

```
active ──(홈 버튼)──▶ background ──(복귀)──▶ active
   │                     │                    │
   startAutoRefresh   stopAutoRefresh     startAutoRefresh
                      iOS 가 JS 를 곧 멈춤   소켓 재연결 · 토큰 갱신
```

- 브라우저 탭과 달리 **OS 가 앱을 얼린다.** 타이머 · 웹소켓이 멈추거나 끊긴다.
- 그래서 Supabase 문서는 `AppState` 로 자동 갱신을 켜고 끄라고 한다 (`src/lib/supabase.ts`).
- 복귀 순간 네트워크가 아직 없으면 갱신이 실패하고, auth-js 가 그 실패를 60초 캐시한다 → #2767.

## 5. Expo 가 해주는 것

| 개념 | 설명 |
|---|---|
| **Expo Go** | 미리 빌드된 "빈 앱". 내 JS 번들만 받아서 실행. Xcode 빌드 없이 바로 확인 (이 lab 이 이 방식) |
| **Development build** | 내가 쓴 네이티브 모듈까지 포함해서 직접 빌드한 앱. Expo Go 에 없는 모듈을 쓰면 필요 |
| **CNG** | `ios/` · `android/` 폴더를 손으로 관리하지 않고 `app.json` 에서 생성 |
| **EAS** | 클라우드 빌드 · 스토어 제출 · OTA 업데이트 |
| **expo-router** | Next.js 식 파일 기반 라우팅 (위 대응표) |

최근 RN 의 기본값: `src/app/` 파일 라우팅 · Hermes 기본 · New Architecture(Fabric · JSI) 기본이다.

## 6. 이 lab 파일 지도

```
src/
├─ app/                    ← 라우트만 (화면 파일)
│  ├─ _layout.tsx          Stack 네비게이터 · 화면 제목
│  ├─ index.tsx            로그인 · 환경 정보 · 콜드 스타트 라우팅
│  ├─ refresh.tsx          #2767 시나리오
│  └─ realtime.tsx         #1730 시나리오 (모드 5개)
├─ lib/                    ← 라우트가 아닌 코드
│  ├─ supabase.ts          클라이언트 팩토리 · 계측 fetch · AppState 훅
│  └─ log.ts               이벤트 로그 (화면 + Metro 콘솔)
└─ components/             ← 재사용 UI
   ├─ button.tsx
   └─ log-view.tsx
supabase/                  ← 로컬 백엔드 (Docker)
├─ config.toml             jwt_expiry 300 · 포트 544xx
└─ migrations/             messages 테이블 · RLS · realtime 공개
scripts/cold-start.sh      시뮬레이터에서 앱을 죽였다 살려 특정 화면으로
```

규칙 하나: `src/app/` 에는 화면만 둔다. 거기 둔 파일은 전부 라우트가 되기 때문이다 (Next.js 의 `page.tsx` 와 같은 이유).

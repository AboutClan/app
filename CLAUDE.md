# CLAUDE.md

어바웃(ABOUT) 서비스 앱. 화면은 전부 웹(`../about-web`, Next.js)이고 이 저장소는 React Native 0.77 WebView 셸입니다. 로직은 사실상 `App.tsx` 한 파일에 있습니다. 브리지·딥링크·푸시 동작 설명은 [README.md](README.md)에, 서비스 도메인은 `../about-docs/summary.md`에 있습니다.

## 쌍둥이 저장소 주의: `../cafemap-app`

`../cafemap-app`(카공지도 앱)은 이 저장소를 복제해 만든 거의 동일한 코드입니다. iOS 프로젝트 폴더명(`ios/어바웃`), Android `namespace`(`com.about.studyaboutclubapp`), `package.json`/`app.json`의 name까지 같아서 **경로만 보고는 어느 앱인지 구분되지 않습니다.** 수정 전 cwd가 `about-app/`인지 확인하세요. 한쪽에 고친 공통 로직(딥링크 정규화, 푸시, 브리지)을 다른 쪽에도 반영할지는 매번 판단해야 합니다 — 자동으로 동기화되지 않습니다.

- 이 앱: bundle id / applicationId `com.about.studyaboutclubapp`, 스킴 `about20s`, 시작 URL `https://study-about.club/`
- 카공지도 앱: `club.about20s.cafemap`, 스킴 `kagongmap`, 시작 URL `https://study-about.club/cafe-map`

**두 앱 사이에 웹뷰 경로는 없습니다.** 서로 독립된 앱이고, 이 앱은 `kagongmap://`을 `Linking.openURL`로 외부 실행만 합니다(`onShouldStartLoadWithRequest`, 미설치 시 스토어 이동은 웹 쪽 타이머 담당). 두 앱 모두 UA에 `about_club_app`을 씁니다(`App.tsx`의 `appConfig.agentSelector`). 웹의 `isApp()`(`about-web/utils/validationUtils.ts`)은 `window.ReactNativeWebView` 존재만 보므로 **웹은 UA로도 isApp()으로도 어느 앱인지 알 수 없습니다.** 웹은 대신 sessionStorage 표식을 씁니다(`about-web/features/cafeMap/utils/cafeMapSession.ts`).

- 이 앱은 `applicationNameForUserAgent`(기본 UA 뒤에 덧붙임), 카공지도 앱은 `userAgent`(UA 전체 교체)입니다. 같은 문자열이지만 최종 UA는 다릅니다.

## Commands

```bash
npm ci                    # postinstall에서 patch-package 실행 (packageManager 필드는 yarn이지만 lockfile은 npm)
npm start                 # Metro
npm run android           # 디버그 실행
npm run android:prod      # release 모드 실행
cd ios && bundle exec pod install   # iOS는 ios/어바웃.xcworkspace로 열기
npm run aab:android       # 스토어 업로드용 AAB (끝의 `open`은 macOS 전용)
npm run apk:android
```

- `bump-*` 스크립트는 `bundle exec fastlane bump`를 부르지만 **Fastfile도 Gemfile의 fastlane도 없어 동작하지 않습니다.** 버전은 수동으로 올립니다: Android `android/app/build.gradle`의 `versionCode`/`versionName`, iOS `project.pbxproj`의 `MARKETING_VERSION`/`CURRENT_PROJECT_VERSION`.
- 강제 업데이트 기준은 `App.tsx` 상단 `FORCE_UPDATE_VERSION_ANDROID`/`_IOS`. 스토어에 아직 없는 버전으로 올리면 전 사용자가 업데이트 모달에 갇힙니다.
- release 서명은 `android/key.properties`(→ `RELEASE_*`)를 `app/build.gradle`이 읽어 주입합니다. keystore 경로는 `android/app/` 기준.
- 테스트(`__tests__/`)는 템플릿 수준이라 회귀 검증 수단이 아닙니다. 검증은 실기기 확인입니다.

## patches/

`@react-native/community-cli-plugin@0.77.3` 하나 — `runServer.js`의 `unstable_extraMiddleware` 배열에 `.filter(Boolean)`을 추가합니다. 사유 주석은 없지만 `@react-native-community/cli` 20.x와 RN 0.77 조합에서 undefined 미들웨어로 Metro가 죽는 것을 막는 용도로 보입니다. RN이나 cli 버전을 올리면 패치가 적용 실패하므로 함께 정리하세요.

## WebView ↔ 네이티브 브리지

- 로드 URL은 `appConfig.uri` 하나로 **운영(`https://study-about.club/`) 고정**이고 dev 분기가 없습니다. 로컬 웹으로 테스트하려면 임시로 바꾸고 커밋하지 마세요.
- 웹→앱: `onGetMessage`가 JSON을 파싱해 `data.type || data.name`으로 `messageHandlers`를 찾습니다. 키: `share`, `callPhone`, `sendTextMessage`, `vibrate`, `haptic`, `getDeviceInfo`, `requestNotificationPermission`(이 앱 전용), `openExternalLink`, `exitApp`, `webviewReady`.
- 앱→웹(`postMessage`, `name` 필드): `deeplink`{path, params}, `deviceInfo`{fcmToken, deviceId, platform, appVersion, buildNumber}, `notificationPermission`{granted, openedSettings}, `backAction`(Android 하드웨어 백은 네이티브가 처리하지 않고 웹에 위임).
- 딥링크는 웹이 `webviewReady`를 보내기 전까지 `pendingDeepLinkRef`에 큐잉됩니다. 웹 쪽에서 `webviewReady` 송신을 빠뜨리면 콜드스타트 딥링크가 유실됩니다.
- 브리지 메시지를 추가/변경하면 웹(`../about-web`) 수신·송신 코드와 짝으로 바꿔야 합니다.

## 딥링크

모든 진입 URL은 `toAboutSchemeIfKakaoLink` → `toAboutSchemeIfWebUrl` → `normalizeDeeplink`를 거쳐 `about20s://` 형태로 정규화된 뒤에만 웹으로 전달됩니다(그 외 스킴은 버려짐).

- 커스텀 스킴: `about20s` (AndroidManifest, `ios/어바웃/Info.plist`)
- Android App Links: `about20s.club`, `www.about20s.club` (autoVerify). `study-about.club` 필터는 주석 처리됨
- iOS Universal Links: `applinks:study-about.club` (`ios/어바웃/어바웃.entitlements`)
- 카카오링크: `kakao0ab4a527fe2b99e3c18e904244a97e20://kakaolink` — **카공지도 앱도 같은 키·같은 필터를 등록**하고 있고, iOS applinks 도메인도 두 앱이 같습니다. 두 앱이 모두 설치된 기기에서 어느 앱이 열릴지는 보장되지 않습니다.
- 스킴 전체 목록은 `../딥링크스킴.xlsx`. 스킴/도메인 변경 시 Manifest·Info.plist·entitlements·`App.tsx` 정규화·카카오 콘솔·FCM payload `deeplink`를 함께 맞춰야 합니다.

## 기타

- `android/app/google-services.json`에는 이 앱과 카공지도(`club.about20s.cafemap`) 클라이언트가 함께 들어 있습니다(같은 Firebase 프로젝트).
- `geolocationEnabled`는 Android에서 끄면 웹의 `getCurrentPosition()`이 프롬프트 없이 즉시 실패합니다.
- `shouldAllowGesture`가 탭 루트(`/home`, `/studyPage`, `/gather`, `/group`, `/user`)에서 iOS 스와이프 백을 막습니다. 탭 경로를 바꾸면 여기도 고치세요.

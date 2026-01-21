#import "AppDelegate.h"
#import <Firebase.h>
#import <React/RCTBundleURLProvider.h>
#import <UserNotifications/UserNotifications.h>
#import <RNCPushNotificationIOS.h>
#import "RNSplashScreen.h"

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  // 1. Firebase 초기화
  [FIRApp configure];

  // 2. React Native 설정 (타겟 이름 "어바웃" 확인)
  self.moduleName = @"어바웃";
  self.initialProps = @{};

  // 3. 푸시 알림 델리게이트
  UNUserNotificationCenter *center = [UNUserNotificationCenter currentNotificationCenter];
  center.delegate = self;

  // 4. 부모 클래스 초기화 (이 과정에서 bundleURL을 호출합니다)
  BOOL result = [super application:application didFinishLaunchingWithOptions:launchOptions];

  // 5. 스플래시 화면
  [RNSplashScreen show];

  return result;
}

#pragma mark - JS Bundle Configuration (중요: 이 부분이 누락되면 크래시가 발생합니다)

- (NSURL *)bundleURL
{
#if DEBUG
  // 개발 모드: Metro 서버에서 index 번들을 가져옵니다.
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  // 배포 모드: 앱 내부에 포함된 main.jsbundle을 사용합니다.
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

// 명시적으로 Bridge Delegate 메서드도 추가하여 안정성을 높입니다.
- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

#pragma mark - Push Notification Handlers

- (void)application:(UIApplication *)application didRegisterForRemoteNotificationsWithDeviceToken:(NSData *)deviceToken
{
  [RNCPushNotificationIOS didRegisterForRemoteNotificationsWithDeviceToken:deviceToken];
}

- (void)application:(UIApplication *)application didReceiveRemoteNotification:(NSDictionary *)userInfo fetchCompletionHandler:(void (^)(UIBackgroundFetchResult))completionHandler
{
  [RNCPushNotificationIOS didReceiveRemoteNotification:userInfo fetchCompletionHandler:completionHandler];
}

- (void)application:(UIApplication *)application didFailToRegisterForRemoteNotificationsWithError:(NSError *)error
{
  [RNCPushNotificationIOS didFailToRegisterForRemoteNotificationsWithError:error];
}

- (void)userNotificationCenter:(UNUserNotificationCenter *)center didReceiveNotificationResponse:(UNNotificationResponse *)response withCompletionHandler:(void (^)(void))completionHandler
{
  [RNCPushNotificationIOS didReceiveNotificationResponse:response];
  if (completionHandler) completionHandler();
}

- (void)userNotificationCenter:(UNUserNotificationCenter *)center willPresentNotification:(UNNotification *)notification withCompletionHandler:(void (^)(UNNotificationPresentationOptions options))completionHandler
{
  completionHandler(UNNotificationPresentationOptionSound | UNNotificationPresentationOptionAlert | UNNotificationPresentationOptionBadge);
}

@end
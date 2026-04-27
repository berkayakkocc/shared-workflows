import 'package:flutter_test/flutter_test.dart';
import 'package:{{PROJECT_SLUG}}/main.dart';

void main() {
  testWidgets('App başlatılıyor', (WidgetTester tester) async {
    await tester.pumpWidget(const App());
    expect(find.byType(App), findsOneWidget);
  });
}

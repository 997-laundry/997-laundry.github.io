# تفعيل الإرسال التلقائي لإيصال التسليم — WhatsApp Business API

بعد التفعيل: عند الضغط على «تأكيد التسليم» تصل **صورة الإيصال** للعميل على واتساب تلقائياً، بدون أي ضغطة إضافية.
قبل التفعيل: تُنسخ صورة الإيصال ويفتح واتساب على محادثة العميل ← اضغط مطوّلاً في خانة الكتابة ← «لصق» ← إرسال.

## أولاً: Meta (مرة واحدة)
1. **حساب الأعمال**: business.facebook.com ← أنشئ «Business portfolio» باسم 997 Laundry، ثم وثّق النشاط (Business verification) بالسجل التجاري 88745-2.
2. **التطبيق**: developers.facebook.com ← My Apps ← Create app ← النوع **Business** ← أضف منتج **WhatsApp**.
3. **الرقم**: WhatsApp ← API Setup ← Add phone number. استخدم رقماً غير مسجّل حالياً في تطبيق واتساب (أو إن ظهر لك خيار ربط رقم تطبيق «واتساب للأعمال» الحالي فاستخدمه). أكّد الرقم برسالة SMS.
   انسخ **Phone number ID** (رقم طويل).
4. **الرمز الدائم**: إعدادات الأعمال ← Users ← **System users** ← Add (Admin) ← Generate new token ← اختر التطبيق ← الصلاحيات `whatsapp_business_messaging` و `whatsapp_business_management` ← المدة: **Never** ← انسخ الرمز واحفظه.
5. **طريقة الدفع**: WhatsApp Manager ← Payment settings ← أضف بطاقة (كل رسالة تُحاسب حسب أسعار Meta).
6. **نموذج الرسالة**: WhatsApp Manager ← Message templates ← Create:
   - الاسم: `order_delivered` — الفئة: **Utility** — اللغة: **Arabic**
   - Header: **Image**
   - Body:
     ```
     مرحباً {{1}} 🌸
     تم تسليم طلبك رقم {{2}} بنجاح.
     {{3}}
     مرفق إيصال طلبك. شكراً لتعاملك مع مغسلة 997 💙
     ```
   - Footer: `مغسلة 997 · الرفاع · مفتوح 24 ساعة`
   - أمثلة القيم: `Ali` · `00011` · `المتبقي: 1.750 د.ب`
   - أرسل للمراجعة وانتظر الموافقة (عادة دقائق إلى يوم).

## ثانياً: Supabase (مرة واحدة)
7. supabase.com ← مشروع **997 Laundry** ← **Edge Functions** ← Deploy a new function ← **Via Editor** ← الاسم: `whatsapp-send` ← امسح المثال والصق محتوى الملف `supabase/functions/whatsapp-send/index.ts` ← **Deploy**.
8. Edge Functions ← **Secrets** ← أضف:
   | Name | Value |
   |---|---|
   | `WA_TOKEN` | الرمز الدائم من الخطوة 4 |
   | `WA_PHONE_ID` | Phone number ID من الخطوة 3 |
   | `WA_TEMPLATE` | `order_delivered` |
   | `WA_LANG` | `ar` |

## ثالثاً: النظام
9. الإعدادات ← **التشغيل** ← «📲 إيصال التسليم على واتساب» ← **فحص الربط** ← يجب أن يظهر «✓ الربط جاهز».
10. اضغط **إرسال إيصال تجريبي** ← اكتب رقمك ← تأكد أن الصورة وصلتك.
11. فعّل «إرسال إيصال التسليم تلقائياً عبر WhatsApp Business API» ← **حفظ الإعدادات**.

إذا فشل الإرسال لأي سبب (إنترنت، رمز منتهي، نموذج غير معتمد) يعرض النظام فوراً الطريقة اليدوية (نسخ الصورة وفتح المحادثة)، ويُسجَّل السبب في سجل النشاط.
رمز Meta يبقى في Supabase فقط — لا يظهر في النظام ولا على أجهزة الموظفين.

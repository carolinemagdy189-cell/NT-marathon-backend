# New Testament Marathon — Backend

Backend REST API حقيقي لتطبيق **New Testament Marathon**، مبني بـ Node.js + Express + MongoDB (Mongoose) + JWT + bcrypt — **CommonJS فقط** — وجاهز للربط المباشر مع الـ Vue Frontend.

- **الماراثون:** العهد الجديد كاملًا — من **متى 1** إلى **الرؤيا 22**
- **المدة:** 89 يومًا (2026-10-01 → 2026-12-28) — المنطقة الزمنية: **Africa/Cairo**
- **التوزيع:** 82 يومًا × 3 فصول + 7 أيام × فصلين = **260 فصلًا بالضبط** (خوارزمية محددة التوزيع — نفس الجدول للجميع)
- **الوحدات:** أيام العهد الجديد محفوظة في MongoDB (`ReadingDay`) والـ Backend هو مصدر الحقيقة الوحيد

---

## الفولدرات

```text
backend/                     (جذر هذا المشروع)
│
├── config/
│   ├── db.js                # اتصال MongoDB عبر MONGODB_URI
│   └── marathonData.js      # ثوابت الماراثون + أسفار العهد الجديد (Single Source of Truth)
│
├── controllers/
│   ├── authController.js    # register / login / me / logout
│   ├── readingController.js # today GET+POST / timeline / history
│   ├── progressController.js# progress / books / next-day preview
│   └── adminController.js   # dashboard / users / readings / progress / calendar
│
├── middleware/
│   ├── authMiddleware.js    # JWT Bearer -> req.user من قاعدة البيانات
│   ├── adminMiddleware.js   # role === "admin" وإلا 403
│   └── errorMiddleware.js   # 404 + معالج أخطاء مركزي بصيغة JSON موحدة
│
├── models/
│   ├── User.js              # name/email/password(bcrypt)/role/lastLoginAt
│   ├── ReadingDay.js        # اليوم الـ 89 (dayNumber و date فريدان)
│   ├── DailyReading.js      # سجل اليوم الواحد لكل مستخدم (فهرس فريد userId+dayNumber)
│   └── LoginEvent.js        # حدث لكل تسجيل دخول ناجح
│
├── routes/
│   ├── authRoutes.js
│   ├── readingRoutes.js
│   ├── progressRoutes.js
│   └── adminRoutes.js
│
├── services/
│   ├── marathonService.js   # توليد الجدول (82×3+7×2=260) + مزامنة MongoDB
│   ├── progressService.js   # كل حسابات التقدم المركزية
│   └── adminService.js      # لوحة تحكم الأدمن
│
├── scripts/
│   ├── seedAdmin.js         # npm run seed:admin
│   └── seedReadings.js      # npm run seed:readings
│
├── utils/
│   ├── marathonDate.js      # التاريخ المصري + TEST_DATE_OVERRIDE (تطوير فقط)
│   ├── generateToken.js     # JWT sign/verify
│   ├── apiError.js          # ApiError + صيغ الردود
│   ├── validators.js
│   └── asyncHandler.js
│
├── tests/
│   ├── schedule.test.js     # الجدول والتواريخ (12 اختبار)
│   └── api.test.js          # API كاملة على MongoDB حقيقي (39 اختبار)
│
├── .env                     # (gitignored - لا يُرفع أبدًا)
├── .env.example
├── .gitignore
├── package.json
└── server.js
```

**التدفق:** `server.js → routes → controllers → services → models → MongoDB` — لا يوجد أي business logic داخل `server.js`.

---

## Installation & Run

```bash
npm install
cp .env.example .env        # على ويندوز: copy .env.example .env
```

عدّل `.env` ثم:

```bash
# 1).seed أيام الماراثون (89 يومًا / 260 فصلًا) - idempotent
npm run seed:readings

# 2) إنشاء حساب الأدمن (يقرأ ADMIN_NAME/ADMIN_EMAIL/ADMIN_PASSWORD من .env)
npm run seed:admin

# 3) التشغيل
npm run dev      # تطوير (nodemon)
npm start        # إنتاج
```

الـ API سيكون على `http://localhost:5000` — للفحص السريع: `GET /health`.

## Environment Variables

```env
PORT=5000
NODE_ENV=development
MONGODB_URI=your_mongodb_connection_string     # محلي أو Atlas
JWT_SECRET=your_jwt_secret                     # node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:5173               # روابط CORS المسموحة (فواصل للإنتاج)
TEST_DATE_OVERRIDE=                            # للتطوير فقط (انظر أدناه)
ADMIN_NAME=
ADMIN_EMAIL=
ADMIN_PASSWORD=
```

## MongoDB Setup

- **محلي:** `MONGODB_URI=mongodb://127.0.0.1:27017/new-testament-marathon`
- **Atlas:** `MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/<db>?retryWrites=true&w=majority`

المجموعات تُنشأ تلقائيًا. الفهارس المهمة: `users.email` فريد، و `dailyreadings (userId+dayNumber)` فريد مركب، و `readingdays.dayNumber/date` فريدان.

## الاختبار قبل 1 أكتوبر — TEST_DATE_OVERRIDE

في `.env` أثناء التطوير فقط:

```env
TEST_DATE_OVERRIDE=2026-10-04
```

عندها يتصرف السيرفر كأن اليوم هو 4 أكتوبر 2026 (اليوم 4 — متى 10-12): الأيام 1-3 ماضية، واليوم 4 مُميّز، والأيام 5-89 مقفولة.

| القيمة | السلوك |
|---|---|
| `2026-09-25` | الماراثون لم يبدأ — لا submissions ولا currentDay |
| `2026-10-01` | اليوم 1 (متى 1-3) |
| `2026-10-04` | اليوم 4 (متى 10-12) |
| `2026-11-20` | اليوم 51 |
| `2026-12-28` | اليوم 89 (الرؤيا 21-22 — آخر يوم) |
| `2026-12-29` | الماراثون منتهٍ — لا يوم 90 ولا submissions |

> **مهم:** الـ override يُتجاهل تمامًا عندما `NODE_ENV=production` — لا يمكن لأي مستخدم تغيير تاريخ الماراثون. اتركه فارغًا في الإنتاج.

## API Endpoints

صيغة الردود الموحدة: نجاح `{ success: true, data: {...} }` — خطأ `{ success: false, message: "..." }`

### Auth
| Method | Endpoint | الوصف |
|---|---|---|
| POST | `/api/auth/register` | `{ name, email, password, confirmPassword }` → JWT + user (بدون password). `role` يُتجاهل من الـ body دائمًا. |
| POST | `/api/auth/login` | `{ email, password }` → JWT + user. يسجل `LoginEvent` ويحدّث `lastLoginAt`. خطأ عام عند الفشل. |
| GET | `/api/auth/me` | المستخدم الحالي (JWT) — بدون password. |
| POST | `/api/auth/logout` | نظري (JWT stateless) — الواجهة تحذف التوكن. |

### Readings / Progress (JWT)
| Method | Endpoint | الوصف |
|---|---|---|
| GET | `/api/readings/today` | كل بيانات الصفحة الرئيسية: `currentDay 4/89`، `12/260`، المتبقي، النسبة، هدف اليوم، قراءة اليوم، حالته، الـ reflection |
| POST | `/api/readings/today` | `{ chaptersRead, reflection }` — الـ reflection **إجباري**، فصل واحد لكل يوم (فهرس فريد)، الأيام المستقبلية مرفوضة، 1/3 → `partial`، 3/3 → `completed` |
| GET | `/api/readings/timeline` | الـ 89 يومًا للقائمة القابلة للتمرير: `isPast/isToday/isFuture/locked` + حالة كل يوم للمستخدم |
| GET | `/api/readings/history` | سجل قراءة المستخدم فقط (الأحدث أولًا) مع العنوان والتاريخ |
| GET | `/api/readings/history/:dayNumber` | تفاصيل يوم ماضٍ (القراءة + الـ reflection + الوقت) — المستقبل 403 |
| GET | `/api/progress` (أو `/api/progress/me`) | الرحلة الكاملة: chaptersRead/260، النسبة، المتبقي، الأيام المكتملة/الجزئية/الفائتة، نسبة الالتزام |
| GET | `/api/progress/books` | تقدم كل سفر: متى 12/28 = 42.86% ... |
| GET | `/api/progress/next` | معاينة "غدًا": اليوم التالي + عنوانه — وحالة "منتهٍ" بعد 28 ديسمبر |

### Admin (JWT + role=admin — غير ذلك 403)
| Method | Endpoint | الوصف |
|---|---|---|
| GET | `/api/admin/dashboard` | إحصائيات حية: عدد المستخدمين، أكملوا/جزئي/لم يسجلوا اليوم، هدف اليوم، اليوم الحالي، تقدم المجتمع التراكمي، جدول كل المستخدمين (بحث/فلترة/صفحات عبر `?search=&status=&page=&limit=&date=`) |
| GET | `/api/admin/users` | قائمة المستخدمين مع حالة اليوم المختار |
| GET | `/api/admin/users/:id` | تفاصيل مشارك + تقدمه + سجله الكامل |
| GET | `/api/admin/readings?date=` | صفوف القراءة ليوم محدد (تقويم الأدمن) |
| GET | `/api/admin/progress` | تقدم المجتمع + تقدم كل مستخدم |
| GET | `/api/admin/calendar` | الـ 89 يومًا مع عدادات الأيام المكتملة/الجزئية |

### القراءة للتقويم في لوحة الأدمن
`?date=2026-10-02` يعيد حالة كل مستخدم لذلك اليوم: الفصول المطلوبة، المقروء، الحالة، الـ reflection، وقت أول تسجيل دخول في ذلك اليوم (بتوقيت القاهرة)، ووقت حفظ القراءة.

## قواعد العمل المطبقة

- **فصل يوم واحد:** فهرس فريد `userId+dayNumber` — المحاولة الثانية → `409` (محمي على مستوى قاعدة البيانات لا الواجهة).
- **الـ reflection إجباري:** فارغ أو مسافات → `400`.
- **`not_registered` لا يُخزن أبدًا:** يُحسب عند غياب السجل.
- **لا تجاوز 260:** كل حساب يحد الفصول المحسوبة بـ `min(chaptersRead, assignedChapters)` ثم `min(Σ, 260)`.
- **الأيام المستقبلية:** مقفولة للعرض التفصيلي (403) ومستحيلة للـ submission.
- **حسابات مركزية:** كل الأرقام من `progressService` — لا تكرار للحسابات في أماكن متعددة.
- **تتبع الدخول:** `LoginEvent` لكل دخول + `lastLoginAt`، وأول دخول لكل يوم قاهري يظهر للأدمن.

## Security

- bcrypt لكلمات المرور (`select: false` ولا تُعاد في أي رد).
- JWT مع تحقق الدور من قاعدة البيانات في كل طلب.
- `role` لا يُقبل من الواجهة؛ الأدمن فقط عبر `npm run seed:admin`.
- CORS عبر `CLIENT_URL`، تحقق من كل المدخلات، رموز HTTP صحيحة، معالج أخطاء مركزي لا يكشف تفاصيل الإنتاج.
- `.env` في `.gitignore` — لا أسرار في الكود.

## Testing

```bash
npm test             # كل الاختبارات (51)
npm run test:schedule # الجدول + التواريخ فقط
npm run test:api      # الـ API فقط (على قاعدة test منفصلة تلقائيًا)
```

تغطي: التسجيل والمكرر والتحقق، الدخول الخاطئ، JWT، 401/403، اليوم 1/4/50/89، partial/completed، الـ reflection الإجباري، منع التكرار، السجل، التقدم، الأسفار، إحصائيات الأدمن، التقويم، تقدم المجتمع، وما قبل 1 أكتوبر وبعد 28 ديسمبر.

## Deployment

1. على المنصة (Render/Railway/VPS): اضبط `MONGODB_URI` (Atlas)، `JWT_SECRET` عشوائي طويل، `CLIENT_URL` برابط الواجهة، `NODE_ENV=production` — واترك `TEST_DATE_OVERRIDE` فارغًا.
2. `npm start` (أو PM2: `pm2 start server.js --name marathon-api`).
3. شغّل مرة واحدة: `npm run seed:readings` ثم `npm run seed:admin`.
4. HTTPS أمام الـ API (nginx أو منصة الاستضافة)، و Atlas IP allowlist محمي.
# NT-marathon-backend

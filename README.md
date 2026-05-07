# smart-excel-order-import

智能物流订单导入系统。项目面向物流、快递、仓配等批量下单场景，支持上传不同格式的 Excel 模板，自动识别字段映射，完成数据预览、在线编辑、校验、重复检测、批量提交和历史运单查询。

## 功能特性

- Excel 文件导入：支持 `.xlsx` / `.xls` 文件，提供点击上传和拖拽上传。
- 多模板自动识别：根据表头关键词识别不同列名、不同列序、多 Sheet、标题行等模板结构。
- 手动字段映射：自动识别置信度不足时，可手动选择 Excel 列与系统字段的对应关系。
- 模板记忆学习：字段映射会按表头指纹保存到数据库，下次上传相同结构模板时自动应用。
- 导入进度展示：解析 Excel 时展示百分比和当前处理条数。
- 数据预览编辑：以类 Excel 表格展示订单数据，支持点击单元格编辑、Tab / Enter 操作、新增行和删除行。
- 实时数据校验：对必填字段、电话、重量、件数、温层进行校验，并一次性展示全部错误。
- 重复编码检测：支持同批次外部编码重复检测，也会查询数据库中已存在的外部编码。
- Excel 导出：可将当前预览和修改后的数据导出为新的 Excel 文件。
- 批量提交下单：提交前拦截错误数据，提交时展示进度，并将订单持久化到数据库。
- 历史运单列表：支持查看已导入记录，并按关键词、提交日期范围搜索，支持分页。

## 技术栈

- Next.js App Router
- React
- TypeScript
- Prisma
- PostgreSQL
- xlsx
- lucide-react
- CSS Modules

## 核心字段

系统会将不同 Excel 模板中的列统一映射到以下标准字段：

| 字段 | 是否必填 | 说明 |
| --- | --- | --- |
| 外部编码 | 否 | 外部系统订单唯一编号，用于重复检测 |
| 发件人姓名 | 是 | 寄件人姓名 |
| 发件人电话 | 是 | 寄件人联系方式 |
| 发件人地址 | 是 | 寄件人完整地址 |
| 收件人姓名 | 是 | 收货人姓名 |
| 收件人电话 | 是 | 收货人联系方式 |
| 收件人地址 | 是 | 收货人完整地址 |
| 重量 (kg) | 是 | 货物重量，必须为正数 |
| 件数 | 是 | 包裹数量，必须为正整数 |
| 温层 | 是 | 仅支持 `常温`、`冷藏`、`冷冻` |
| 备注 | 否 | 附加说明 |

## 项目结构

```text
.
├── excel/                         # 测试 Excel 模板
├── prisma/
│   └── schema.prisma              # Order 和 TemplateMapping 数据模型
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── mappings/          # 模板映射记忆接口
│   │   │   └── orders/            # 运单提交、查询、重复检测接口
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── ExcelWorkspace.tsx     # 导入工作台主流程
│   │   ├── DataPreview.tsx        # 数据预览、编辑和校验
│   │   ├── MappingModal.tsx       # 手动字段映射弹窗
│   │   └── HistoryList.tsx        # 历史运单列表
│   ├── lib/
│   │   └── prisma.ts              # Prisma Client 单例
│   └── utils/
│       └── excelParser.ts         # Excel 解析和表头映射逻辑
└── package.json
```

## 本地开发

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

在项目根目录创建 `.env`：

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public"
```

### 3. 初始化数据库

```bash
npx prisma generate
npx prisma db push
```

### 4. 启动开发服务

```bash
npm run dev
```

打开浏览器访问：

```text
http://localhost:3000
```

## 常用脚本

```bash
npm run dev      # 启动本地开发服务
npm run build    # 生成 Prisma Client 并构建生产版本
npm run start    # 启动生产服务
npm run lint     # 运行 ESLint 检查
```

## 使用流程

1. 在首页上传 Excel 文件，系统会自动解析 Sheet、定位表头并匹配字段。
2. 如果字段识别不完整，在映射弹窗中手动选择对应列。
3. 进入预览页面后，检查标红单元格和全部错误列表。
4. 直接点击单元格修改数据，也可以新增、删除行。
5. 校验通过后点击确认提交，订单会写入数据库。
6. 在历史运单页查询已导入记录，支持分页、关键词和日期筛选。

## 测试模板

`excel/` 目录内包含 5 个示例模板，用于验证不同列名、不同列序、英文表头、多 Sheet、标题行等情况：

- `template1-standard.xlsx`
- `template2-ecommerce.xlsx`
- `template3-english.xlsx`
- `template4-grouped.xlsx`
- `template5-multisheet.xlsx`

## 部署

项目可部署到 Vercel。部署前需要在 Vercel 项目环境变量中配置 `DATABASE_URL`，并确保数据库为 PostgreSQL 兼容服务，例如 Neon、Supabase 或 Vercel Postgres。

推荐部署流程：

1. 将代码推送到 GitHub。
2. 在 Vercel 导入该仓库。
3. 配置 `DATABASE_URL` 环境变量。
4. 执行部署，构建命令使用默认的 `npm run build`。

## API 概览

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/orders` | `GET` | 查询历史运单，支持分页、关键词和日期范围 |
| `/api/orders` | `POST` | 批量提交订单 |
| `/api/orders/check-duplicates` | `POST` | 检测外部编码是否已存在 |
| `/api/mappings` | `GET` | 按表头指纹读取模板映射 |
| `/api/mappings` | `POST` | 保存或更新模板映射 |

## 数据模型

项目包含两张核心表：

- `Order`：保存已提交的运单信息。
- `TemplateMapping`：保存 Excel 表头指纹和字段映射规则。

## 许可证

本项目当前未指定开源许可证。

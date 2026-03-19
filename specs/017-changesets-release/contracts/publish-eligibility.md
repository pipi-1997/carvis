# 合同：Publish Eligibility

## 1. 适用范围

- 本合同定义哪些 workspace 包可以进入公开发布

## 2. 可发布资格

- 只有同时满足以下条件的 workspace 包才可发布：
  - `private: false`
  - 存在有效 `version`
  - 属于公开 `@carvis/*` release group
- 当前符合资格的公开包快照必须由契约测试锁定，避免规则与文档漂移

## 3. 不可发布资格

- 以下情况必须被排除在公开发布之外：
  - `private: true`
  - 缺失 `version`
  - 明确标记为内部 skill / internal-only package

## 4. 发布结果语义

- 每个进入发布阶段的 package 必须产生明确结果：
  - `published`
  - `skipped_existing_version`
  - `failed`

## 5. operator 期望

- operator 必须能根据日志或发布摘要判断：
  - 哪些包参与本轮发布
  - 哪些包被资格规则排除
  - 哪些包因版本已存在而跳过
  - 失败后下一步是 rerun 还是手工 fallback

## 6. 非目标行为

- 不允许私有包因 workflow 配置失误被误发到 npm
- 不允许缺失版本号的包在发布阶段才以隐式失败暴露

const FEISHU_TENANT_ACCESS_TOKEN_URL =
  "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal";

const FEISHU_PLATFORM_HOME_URL = "https://open.feishu.cn/";
const FEISHU_APP_CONSOLE_URL = "https://open.feishu.cn/app";
const FEISHU_DOCS_HOME_URL = "https://open.feishu.cn/document/home/index";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type FeishuSetupInput = {
  allowFrom: string[];
  appId: string;
  appSecret: string;
  requireMention: boolean;
};

export type FeishuSetupField = {
  key: "appId" | "appSecret" | "allowFrom" | "requireMention";
  envName?: "FEISHU_APP_ID" | "FEISHU_APP_SECRET";
  required: boolean;
  label: string;
  description: string;
  howToGet: string[];
  promptHelpTitle?: string;
  promptHint?: string[];
  defaultValue?: string | boolean | string[];
};

export type FeishuSetupGuideLink = {
  label: string;
  url: string;
};

export type FeishuSetupGuideSection = {
  checklist?: string[];
  id: "allowlist" | "bot-permissions" | "create-app" | "credentials" | "event-delivery";
  links?: FeishuSetupGuideLink[];
  steps: string[];
  summary: string;
  title: string;
};

export type FeishuSetupGuide = {
  links: FeishuSetupGuideLink[];
  quickstartChecklist: string[];
  sections: FeishuSetupGuideSection[];
  summary: string;
  title: string;
};

export type FeishuSetupSpec = {
  adapter: "feishu";
  fields: FeishuSetupField[];
  guide: FeishuSetupGuide;
  mode: "websocket";
};

export type FeishuProbeResult =
  | {
      message: string;
      ok: true;
    }
  | {
      code: "FEISHU_UNAVAILABLE" | "INVALID_CREDENTIALS";
      message: string;
      ok: false;
    };

export function getFeishuSetupSpec(): FeishuSetupSpec {
  return {
    adapter: "feishu",
    fields: [
      {
        key: "appId",
        envName: "FEISHU_APP_ID",
        required: true,
        label: "Feishu App ID",
        description: "用于建立 Feishu websocket 连接和发送消息。",
        howToGet: [
          "进入飞书开放平台，打开你的企业自建应用。",
          "在“凭证与基础信息”页复制 App ID。",
        ],
        promptHelpTitle: "Feishu App ID",
        promptHint: [
          "去飞书开放平台 -> 企业自建应用 -> 凭证与基础信息。",
          "复制该应用的 App ID，填到 FEISHU_APP_ID。",
          `控制台: ${FEISHU_APP_CONSOLE_URL}`,
        ],
      },
      {
        key: "appSecret",
        envName: "FEISHU_APP_SECRET",
        required: true,
        label: "Feishu App Secret",
        description: "用于换取 tenant access token，并校验 websocket 凭据。",
        howToGet: [
          "进入飞书开放平台，打开你的企业自建应用。",
          "在“凭证与基础信息”页复制 App Secret。",
        ],
        promptHelpTitle: "Feishu App Secret",
        promptHint: [
          "App Secret 和 App ID 必须来自同一款应用。",
          "如果你刚重置过 Secret，请使用最新值。",
          `控制台: ${FEISHU_APP_CONSOLE_URL}`,
        ],
      },
      {
        key: "allowFrom",
        required: true,
        label: "Allowlist",
        description: "允许触发 bot 的 chat_id 列表，使用 * 表示全部允许。",
        howToGet: [
          "首次调通建议先填 *，先确认 bot 能收发消息。",
          "收敛权限时，把允许的 chat_id 逐个填入，多个值用逗号分隔。",
        ],
        promptHelpTitle: "Allowlist",
        promptHint: [
          "首次调试建议先填 *，确认链路可用后再改成具体 chat_id。",
          "多个 chat_id 用逗号分隔。",
          `文档入口: ${FEISHU_DOCS_HOME_URL}`,
        ],
        defaultValue: ["*"],
      },
      {
        key: "requireMention",
        required: true,
        label: "Require Mention",
        description: "群聊中是否要求必须 @ 机器人后才处理消息。",
        howToGet: [
          "如果希望减少误触发，设为 true。",
          "如果先追求顺利接通，建议初次调试时设为 false。",
        ],
        promptHelpTitle: "Require Mention",
        promptHint: [
          "群聊里设为 true 表示必须 @ 机器人才会触发。",
          "首次调试通常可以先设为 false。",
          `开放平台: ${FEISHU_PLATFORM_HOME_URL}`,
        ],
        defaultValue: false,
      },
    ],
    guide: {
      links: [
        {
          label: "飞书开放平台",
          url: FEISHU_PLATFORM_HOME_URL,
        },
        {
          label: "应用管理控制台",
          url: FEISHU_APP_CONSOLE_URL,
        },
        {
          label: "开放平台文档首页",
          url: FEISHU_DOCS_HOME_URL,
        },
      ],
      quickstartChecklist: [
        "先创建企业自建应用，再复制 App ID 和 App Secret。",
        "给应用开启机器人能力，并确认权限已经发布到企业内可用版本。",
        "Carvis 当前走 Feishu websocket/长连接模式，不需要公网回调地址。",
        "首次调试 allowFrom 建议先填 *；确认通路后再收紧到具体 chat_id。",
      ],
      sections: [
        {
          id: "create-app",
          title: "1. 创建企业自建应用",
          summary: "Carvis 当前按企业自建应用接入飞书，不依赖外部 SaaS 回调托管。",
          steps: [
            "登录飞书开放平台并进入应用管理。",
            "创建企业自建应用，准备后续机器人、事件订阅和权限配置。",
            "如果企业内还没有安装该应用，先完成企业内安装或启用。",
          ],
          checklist: [
            "你已经能在开放平台控制台看到这款应用。",
            "这款应用属于准备接入 Carvis 的目标企业。",
          ],
          links: [
            {
              label: "飞书开放平台",
              url: FEISHU_PLATFORM_HOME_URL,
            },
            {
              label: "应用管理控制台",
              url: FEISHU_APP_CONSOLE_URL,
            },
          ],
        },
        {
          id: "credentials",
          title: "2. 获取 App ID 和 App Secret",
          summary: "CLI 会在写配置前校验凭据，所以这里必须拿到真实可用的凭据。",
          steps: [
            "进入应用详情页的“凭证与基础信息”。",
            "复制 App ID，稍后填写到 FEISHU_APP_ID。",
            "复制 App Secret，稍后填写到 FEISHU_APP_SECRET。",
          ],
          checklist: [
            "App ID 和 App Secret 来自同一款应用。",
            "如果你刚刚重置过 Secret，请使用最新值。",
          ],
          links: [
            {
              label: "应用管理控制台",
              url: FEISHU_APP_CONSOLE_URL,
            },
          ],
        },
        {
          id: "bot-permissions",
          title: "3. 开启机器人能力并检查权限",
          summary: "仅有凭据还不够；机器人能力、应用权限和企业内可用版本也需要一起准备。",
          steps: [
            "在应用能力里开启机器人能力，确保应用可以作为 bot 出现在会话中。",
            "按你的消息读写需求勾选所需权限，并把变更发布到企业内可用版本。",
            "把 bot 拉入目标群聊或确保目标用户能在私聊中找到它。",
          ],
          checklist: [
            "bot 已经能被添加到目标群聊或私聊。",
            "权限变更已经发布，而不是只停留在草稿态。",
          ],
          links: [
            {
              label: "飞书开放平台",
              url: FEISHU_PLATFORM_HOME_URL,
            },
          ],
        },
        {
          id: "event-delivery",
          title: "4. 事件接收使用 websocket / 长连接",
          summary: "Carvis 通过 Feishu websocket 长连接接收事件，所以不要求你准备公网 callback URL。",
          steps: [
            "在事件订阅里确认应用已按长连接模式接收事件，而不是依赖公网回调地址。",
            "确保消息相关事件已经按你的接入方式完成配置。",
            "如果消息始终进不来，优先回头检查机器人可见范围、权限发布和事件配置是否一致。",
          ],
          checklist: [
            "你不需要为 Carvis 额外准备公网 webhook 地址。",
            "消息事件配置与机器人可见范围一致。",
          ],
          links: [
            {
              label: "开放平台文档首页",
              url: FEISHU_DOCS_HOME_URL,
            },
          ],
        },
        {
          id: "allowlist",
          title: "5. 规划 allowFrom 和 requireMention",
          summary: "allowFrom 控制哪些会话允许触发 bot，requireMention 控制群聊中是否必须 @ 机器人。",
          steps: [
            "首次调试建议 allowFrom 先填 *，尽快确认链路可用。",
            "稳定后再把 allowFrom 收敛到具体 chat_id，避免无关会话触发。",
            "如果你担心群聊误触发，可以把 requireMention 设为 true。",
          ],
          checklist: [
            "初次调试时允许使用 * 作为 allowFrom。",
            "正式环境建议改成明确的 chat_id 列表。",
            "chat_id 通常需要在 bot 已进入目标会话后再做收集和收敛。",
          ],
        },
      ],
      summary:
        "开始前先把飞书侧准备好：企业自建应用、机器人能力、可用凭据，以及你希望放开的会话范围。",
      title: "飞书接入准备",
    },
    mode: "websocket",
  };
}

export function validateFeishuSetupInput(
  input: unknown,
): { ok: true; value: FeishuSetupInput } | { errors: string[]; ok: false } {
  const candidate = input as Partial<FeishuSetupInput> | null | undefined;
  const errors: string[] = [];
  const appId = candidate?.appId?.trim() ?? "";
  const appSecret = candidate?.appSecret?.trim() ?? "";
  const allowFrom = Array.isArray(candidate?.allowFrom) ? candidate.allowFrom : null;
  const requireMention = candidate?.requireMention;

  if (appId.length === 0) {
    errors.push("appId 不能为空");
  }
  if (appSecret.length === 0) {
    errors.push("appSecret 不能为空");
  }
  if (!allowFrom || allowFrom.length === 0) {
    errors.push("allowFrom 至少需要一个 chat_id 或 *");
  }
  if (typeof requireMention !== "boolean") {
    errors.push("requireMention 必须是布尔值");
  }

  if (errors.length > 0) {
    return {
      errors,
      ok: false,
    };
  }

  return {
    ok: true,
    value: {
      allowFrom: [...allowFrom!],
      appId,
      appSecret,
      requireMention: requireMention as boolean,
    },
  };
}

export async function probeFeishuCredentials(
  input: {
    appId: string;
    appSecret: string;
  },
  options: {
    fetchImpl?: FetchLike;
  } = {},
): Promise<FeishuProbeResult> {
  const fetchImpl = options.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(FEISHU_TENANT_ACCESS_TOKEN_URL, {
      body: JSON.stringify({
        app_id: input.appId,
        app_secret: input.appSecret,
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });
    const payload = (await response.json().catch(() => null)) as
      | {
          code?: number;
          msg?: string;
          tenant_access_token?: string;
        }
      | null;

    if (response.ok && payload?.code === 0 && payload.tenant_access_token) {
      return {
        message: "feishu credentials ready",
        ok: true,
      };
    }

    return {
      code: "INVALID_CREDENTIALS",
      message: payload?.msg ?? `unexpected feishu response: ${response.status}`,
      ok: false,
    };
  } catch (error) {
    return {
      code: "FEISHU_UNAVAILABLE",
      message: error instanceof Error ? error.message : String(error),
      ok: false,
    };
  }
}

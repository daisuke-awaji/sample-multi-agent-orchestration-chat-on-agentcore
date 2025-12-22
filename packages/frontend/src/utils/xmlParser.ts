/**
 * ストリーミングXML解析用のヘルパー関数
 */

export interface ParsedAgentConfig {
  systemPrompt: string;
  enabledTools: string[];
  scenarios: Array<{
    title: string;
    prompt: string;
  }>;
}

export interface XmlParseState {
  currentTag: string | null;
  systemPrompt: string;
  enabledTools: string[];
  scenarios: Array<{
    title: string;
    prompt: string;
  }>;
  currentScenario: {
    title: string;
    prompt: string;
  };
  isInScenarioTitle: boolean;
  isInScenarioPrompt: boolean;
}

/**
 * XMLパーサーの初期状態を作成
 */
export const createInitialXmlState = (): XmlParseState => ({
  currentTag: null,
  systemPrompt: '',
  enabledTools: [],
  scenarios: [],
  currentScenario: {
    title: '',
    prompt: '',
  },
  isInScenarioTitle: false,
  isInScenarioPrompt: false,
});

/**
 * ストリーミングXMLテキストを逐次解析
 * 完全なタグが閉じられた時点で内容を返す
 */
export const parseStreamingXml = (
  xmlChunk: string,
  state: XmlParseState
): {
  state: XmlParseState;
  updates: {
    systemPrompt?: string;
    newTool?: string;
    newScenario?: {
      title: string;
      prompt: string;
    };
  };
} => {
  const updates: {
    systemPrompt?: string;
    newTool?: string;
    newScenario?: {
      title: string;
      prompt: string;
    };
  } = {};

  // tool の処理用の正規表現
  const toolTagRegex = /<tool>(.*?)<\/tool>/g;

  const workingChunk = xmlChunk;

  // system_prompt の処理
  const systemPromptMatch = workingChunk.match(/<system_prompt>([\s\S]*?)(?:<\/system_prompt>|$)/);
  if (systemPromptMatch) {
    const content = systemPromptMatch[1];
    if (content !== state.systemPrompt) {
      state.systemPrompt = content;
      updates.systemPrompt = content;
    }
  }

  // tool の処理（完全なタグのみ）
  let toolMatch;
  while ((toolMatch = toolTagRegex.exec(workingChunk)) !== null) {
    const toolName = toolMatch[1].trim();
    if (!state.enabledTools.includes(toolName)) {
      state.enabledTools.push(toolName);
      updates.newTool = toolName;
    }
  }

  // scenario の処理
  const scenarioMatches = workingChunk.match(/<scenario>([\s\S]*?)<\/scenario>/g);
  if (scenarioMatches) {
    scenarioMatches.forEach((scenarioXml) => {
      const titleMatch = scenarioXml.match(/<title>(.*?)<\/title>/s);
      const promptMatch = scenarioXml.match(/<prompt>([\s\S]*?)<\/prompt>/s);

      if (titleMatch && promptMatch) {
        const title = titleMatch[1].trim();
        const prompt = promptMatch[1].trim();

        // 既に同じタイトルのシナリオが存在しない場合のみ追加
        const existingScenario = state.scenarios.find((s) => s.title === title);
        if (!existingScenario) {
          const newScenario = { title, prompt };
          state.scenarios.push(newScenario);
          updates.newScenario = newScenario;
        }
      }
    });
  }

  return { state, updates };
};

/**
 * 完成したParsedAgentConfigオブジェクトを返す
 */
export const getFinalConfig = (state: XmlParseState): ParsedAgentConfig => ({
  systemPrompt: state.systemPrompt,
  enabledTools: [...state.enabledTools],
  scenarios: [...state.scenarios],
});

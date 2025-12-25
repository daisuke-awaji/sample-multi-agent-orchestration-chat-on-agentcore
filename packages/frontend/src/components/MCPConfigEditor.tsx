import React, { useState } from 'react';
import { AlertCircle, CheckCircle, Loader2, ChevronDown } from 'lucide-react';
import type { MCPConfig } from '../types/agent';
import { fetchLocalMCPTools } from '../api/tools';

interface MCPConfigEditorProps {
  config?: MCPConfig;
  onChange: (config: MCPConfig | undefined) => void;
  disabled?: boolean;
}

interface MCPToolPreview {
  serverName: string;
  name: string;
  description?: string;
}

const SAMPLE_CONFIGS = {
  filesystem: {
    label: 'Filesystem Server',
    config: {
      mcpServers: {
        filesystem: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
        },
      },
    },
  },
  github: {
    label: 'GitHub Server',
    config: {
      mcpServers: {
        github: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
          env: {
            GITHUB_PERSONAL_ACCESS_TOKEN: 'your_github_token_here',
          },
        },
      },
    },
  },
  'aws-docs': {
    label: 'AWS Documentation Server',
    config: {
      mcpServers: {
        'aws-docs': {
          command: 'uvx',
          args: ['awslabs.aws-documentation-mcp-server@latest'],
        },
      },
    },
  },
  multiple: {
    label: 'Multiple Servers',
    config: {
      mcpServers: {
        filesystem: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
        },
        'aws-docs': {
          command: 'uvx',
          args: ['awslabs.aws-documentation-mcp-server@latest'],
        },
      },
    },
  },
};

export const MCPConfigEditor: React.FC<MCPConfigEditorProps> = ({
  config,
  onChange,
  disabled = false,
}) => {
  const [jsonText, setJsonText] = useState<string>(() => {
    if (config) {
      return JSON.stringify(config, null, 2);
    }
    return '';
  });

  const [validationError, setValidationError] = useState<string | null>(null);
  const [isFetchingTools, setIsFetchingTools] = useState(false);
  const [toolsPreview, setToolsPreview] = useState<MCPToolPreview[]>([]);
  const [showSampleDropdown, setShowSampleDropdown] = useState(false);

  // JSON テキストを変更
  const handleTextChange = (text: string) => {
    setJsonText(text);
    setValidationError(null);

    // 空の場合は undefined を返す
    if (!text.trim()) {
      onChange(undefined);
      setToolsPreview([]);
      return;
    }

    // JSON のパース試行（リアルタイムではバリデーションしない）
    try {
      const parsed = JSON.parse(text);
      onChange(parsed);
    } catch {
      // パースエラーは保存時にチェックするため、ここでは無視
    }
  };

  // ツールをプレビュー
  const handleFetchTools = async () => {
    try {
      if (!jsonText.trim()) {
        setValidationError('設定が空です');
        return;
      }

      const parsed = JSON.parse(jsonText);
      setIsFetchingTools(true);
      setValidationError(null);

      const tools = await fetchLocalMCPTools(parsed);
      setToolsPreview(tools);
    } catch (error) {
      setValidationError(
        error instanceof Error ? `ツール取得エラー: ${error.message}` : 'ツール取得に失敗しました'
      );
      setToolsPreview([]);
    } finally {
      setIsFetchingTools(false);
    }
  };

  // サンプルを挿入
  const handleInsertSample = (sampleKey: keyof typeof SAMPLE_CONFIGS) => {
    const sample = SAMPLE_CONFIGS[sampleKey];
    const sampleText = JSON.stringify(sample.config, null, 2);
    setJsonText(sampleText);
    onChange(sample.config);
    setShowSampleDropdown(false);
    setValidationError(null);
    setToolsPreview([]);
  };

  // サーバー名でグループ化
  const groupedTools = toolsPreview.reduce(
    (acc, tool) => {
      if (!acc[tool.serverName]) {
        acc[tool.serverName] = [];
      }
      acc[tool.serverName].push(tool);
      return acc;
    },
    {} as Record<string, MCPToolPreview[]>
  );

  return (
    <div className="space-y-4">
      {/* 説明 */}
      <div className="text-sm text-gray-600">
        <p>
          このエージェントで使用する MCP サーバーを設定します。設定した MCP
          サーバーのツールが自動的に利用可能になります。
        </p>
      </div>

      {/* JSON エディター */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">MCP 設定 (JSON 形式)</label>
        <textarea
          value={jsonText}
          onChange={(e) => handleTextChange(e.target.value)}
          disabled={disabled}
          placeholder={`{\n  "mcpServers": {\n    "github": {\n      "command": "uvx",\n      "args": ["mcp-server-github"],\n      "env": {\n        "GITHUB_TOKEN": "your_token"\n      }\n    }\n  }\n}`}
          rows={12}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed resize-none font-mono text-sm"
        />
      </div>

      {/* アクションボタン */}
      <div className="flex items-center space-x-3">
        {/* サンプル挿入ドロップダウン */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowSampleDropdown(!showSampleDropdown)}
            disabled={disabled}
            className="inline-flex items-center space-x-2 px-3 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <span>サンプルを挿入</span>
            <ChevronDown className="w-4 h-4" />
          </button>

          {showSampleDropdown && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowSampleDropdown(false)} />
              <div className="absolute left-0 top-full mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                {Object.entries(SAMPLE_CONFIGS).map(([key, sample]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleInsertSample(key as keyof typeof SAMPLE_CONFIGS)}
                    className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    {sample.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={handleFetchTools}
          disabled={disabled || isFetchingTools || !jsonText.trim()}
          className="inline-flex items-center space-x-2 px-3 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isFetchingTools ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>取得中...</span>
            </>
          ) : (
            <span>ツールをプレビュー</span>
          )}
        </button>
      </div>

      {/* バリデーションエラー */}
      {validationError && (
        <div className="flex items-start space-x-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-600">{validationError}</p>
          </div>
        </div>
      )}

      {/* ツールプレビュー */}
      {toolsPreview.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-700">利用可能なツール</h3>
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-4">
            {Object.entries(groupedTools).map(([serverName, tools]) => (
              <div key={serverName}>
                <h4 className="text-sm font-medium text-gray-900 mb-2">
                  {serverName} ({tools.length} ツール)
                </h4>
                <div className="space-y-2">
                  {tools.map((tool) => (
                    <div
                      key={`${tool.serverName}::${tool.name}`}
                      className="flex items-start space-x-2 text-sm"
                    >
                      <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-mono text-gray-900">{tool.name}</span>
                        {tool.description && (
                          <span className="text-gray-600"> - {tool.description}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

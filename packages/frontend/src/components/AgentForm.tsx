import React, { useState } from 'react';
import { Plus, X, Save, AlertCircle, Sparkles } from 'lucide-react';
import { ToolSelector } from './ToolSelector';
import type { CreateAgentInput, Agent, Scenario } from '../types/agent';
import { streamAgentResponse, createAgentConfigGenerationPrompt } from '../api/agent';
import { useToolStore } from '../stores/toolStore';
import { parseStreamingXml, createInitialXmlState, type XmlParseState } from '../utils/xmlParser';

interface AgentFormProps {
  agent?: Agent;
  onSubmit: (data: CreateAgentInput) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export const AgentForm: React.FC<AgentFormProps> = ({
  agent,
  onSubmit,
  onCancel,
  isLoading = false,
}) => {
  const [formData, setFormData] = useState<CreateAgentInput>(() => {
    if (agent) {
      return {
        name: agent.name,
        description: agent.description,
        systemPrompt: agent.systemPrompt,
        enabledTools: [...agent.enabledTools],
        scenarios: agent.scenarios.map((s) => ({
          title: s.title,
          prompt: s.prompt,
        })),
      };
    }
    return {
      name: '',
      description: '',
      systemPrompt: '',
      enabledTools: [],
      scenarios: [],
    };
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // AI生成関連の状態
  const [isGenerating, setIsGenerating] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_xmlBuffer, setXmlBuffer] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_xmlParseState, setXmlParseState] = useState<XmlParseState | null>(null);

  const { tools } = useToolStore();

  // バリデーション
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Agent名は必須です';
    } else if (formData.name.length > 50) {
      newErrors.name = 'Agent名は50文字以下で入力してください';
    }

    if (!formData.description.trim()) {
      newErrors.description = '説明は必須です';
    } else if (formData.description.length > 200) {
      newErrors.description = '説明は200文字以下で入力してください';
    }

    if (!formData.systemPrompt.trim()) {
      newErrors.systemPrompt = 'システムプロンプトは必須です';
    } else if (formData.systemPrompt.length < 10) {
      newErrors.systemPrompt = 'システムプロンプトは10文字以上で入力してください';
    }

    // シナリオのバリデーション
    formData.scenarios.forEach((scenario, index) => {
      if (!scenario.title.trim()) {
        newErrors[`scenario_title_${index}`] = 'シナリオタイトルは必須です';
      }
      if (!scenario.prompt.trim()) {
        newErrors[`scenario_prompt_${index}`] = 'シナリオプロンプトは必須です';
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // フォーム送信
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    onSubmit(formData);
  };

  // シナリオ追加
  const addScenario = () => {
    setFormData((prev) => ({
      ...prev,
      scenarios: [
        ...prev.scenarios,
        {
          title: '',
          prompt: '',
        },
      ],
    }));
  };

  // シナリオ削除
  const removeScenario = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      scenarios: prev.scenarios.filter((_, i) => i !== index),
    }));

    // 該当するエラーも削除
    setErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[`scenario_title_${index}`];
      delete newErrors[`scenario_prompt_${index}`];
      return newErrors;
    });
  };

  // シナリオ更新
  const updateScenario = (index: number, field: keyof Scenario, value: string) => {
    setFormData((prev) => ({
      ...prev,
      scenarios: prev.scenarios.map((scenario, i) =>
        i === index ? { ...scenario, [field]: value } : scenario
      ),
    }));

    // エラーをクリア
    if (errors[`scenario_${field}_${index}`]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[`scenario_${field}_${index}`];
        return newErrors;
      });
    }
  };

  // AI生成機能
  const handleAIGeneration = async () => {
    if (!formData.name.trim() || !formData.description.trim()) {
      return;
    }

    setIsGenerating(true);
    setXmlBuffer('');

    // XMLパース状態を初期化
    const initialParseState = createInitialXmlState();
    setXmlParseState(initialParseState);

    // 利用可能なツール名を取得
    const availableTools = tools.map((tool) => tool.name);

    // 生成プロンプトを作成
    const generationPrompt = createAgentConfigGenerationPrompt(
      formData.name,
      formData.description,
      availableTools
    );

    // 一意のセッションID生成
    const sessionId = `ai-generation-${Date.now()}`;

    try {
      let currentParseState = initialParseState;
      let accumulatedXml = '';

      await streamAgentResponse(generationPrompt, sessionId, {
        onTextDelta: (text: string) => {
          accumulatedXml += text;
          setXmlBuffer(accumulatedXml);

          // XMLを逐次解析してフォームに反映
          const { state: newParseState, updates } = parseStreamingXml(
            accumulatedXml,
            currentParseState
          );
          currentParseState = newParseState;
          setXmlParseState(newParseState);

          // システムプロンプトの更新
          if (updates.systemPrompt !== undefined) {
            setFormData((prev) => ({
              ...prev,
              systemPrompt: updates.systemPrompt || '',
            }));
          }

          // ツール選択の更新
          if (updates.newTool) {
            setFormData((prev) => ({
              ...prev,
              enabledTools: [...new Set([...prev.enabledTools, updates.newTool!])],
            }));
          }

          // シナリオの追加
          if (updates.newScenario) {
            setFormData((prev) => ({
              ...prev,
              scenarios: [...prev.scenarios, updates.newScenario!],
            }));
          }
        },
        onComplete: () => {
          console.log('AI生成完了');
          setIsGenerating(false);
        },
        onError: (error: Error) => {
          console.error('AI生成エラー:', error);
          setErrors((prev) => ({
            ...prev,
            generation: `生成に失敗しました: ${error.message}`,
          }));
          setIsGenerating(false);
        },
      });
    } catch (error) {
      console.error('AI生成エラー:', error);
      setErrors((prev) => ({
        ...prev,
        generation: `生成に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`,
      }));
      setIsGenerating(false);
    }
  };

  return (
    <div>
      <form id="agent-form" onSubmit={handleSubmit} className="space-y-6">
        {/* Agent名 */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
            Agent名 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="name"
            value={formData.name}
            onChange={(e) => {
              setFormData((prev) => ({ ...prev, name: e.target.value }));
              if (errors.name) {
                setErrors((prev) => ({ ...prev, name: '' }));
              }
            }}
            disabled={isLoading || isGenerating}
            placeholder="例: コードレビューAgent"
            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed ${
              errors.name ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {errors.name && (
            <div className="flex items-center space-x-1 mt-1">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <span className="text-sm text-red-600">{errors.name}</span>
            </div>
          )}
        </div>

        {/* 説明 */}
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
            説明 <span className="text-red-500">*</span>
          </label>
          <textarea
            id="description"
            value={formData.description}
            onChange={(e) => {
              setFormData((prev) => ({ ...prev, description: e.target.value }));
              if (errors.description) {
                setErrors((prev) => ({ ...prev, description: '' }));
              }
            }}
            disabled={isLoading || isGenerating}
            placeholder="このAgentの用途や特徴を説明してください"
            rows={1}
            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed resize-none ${
              errors.description ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {errors.description && (
            <div className="flex items-center space-x-1 mt-1">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <span className="text-sm text-red-600">{errors.description}</span>
            </div>
          )}
        </div>

        {/* システムプロンプト */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="systemPrompt" className="text-sm font-medium text-gray-700">
              システムプロンプト <span className="text-red-500">*</span>
            </label>
            {/* AI自動生成ボタン */}
            <button
              type="button"
              onClick={handleAIGeneration}
              disabled={
                isLoading || isGenerating || !formData.name.trim() || !formData.description.trim()
              }
              className="inline-flex items-center space-x-1 px-2 py-1 text-xs text-gray-500 bg-white border border-gray-200 rounded hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Sparkles className="w-3 h-3" />
              <span>{isGenerating ? '生成中...' : 'AIで自動生成'}</span>
            </button>
          </div>
          <textarea
            id="systemPrompt"
            value={formData.systemPrompt}
            onChange={(e) => {
              setFormData((prev) => ({ ...prev, systemPrompt: e.target.value }));
              if (errors.systemPrompt) {
                setErrors((prev) => ({ ...prev, systemPrompt: '' }));
              }
            }}
            disabled={isLoading || isGenerating}
            placeholder="このAgentの役割や振る舞いを定義してください"
            rows={6}
            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed resize-none ${
              errors.systemPrompt ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {errors.systemPrompt && (
            <div className="flex items-center space-x-1 mt-1">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <span className="text-sm text-red-600">{errors.systemPrompt}</span>
            </div>
          )}

          {/* 生成エラー表示 */}
          {errors.generation && (
            <div className="flex items-center space-x-1 mt-1">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <span className="text-sm text-red-600">{errors.generation}</span>
            </div>
          )}
        </div>

        {/* ツール選択 */}
        <div>
          <ToolSelector
            selectedTools={formData.enabledTools}
            onSelectionChange={(tools) => setFormData((prev) => ({ ...prev, enabledTools: tools }))}
            disabled={isLoading || isGenerating}
          />
        </div>

        {/* シナリオ管理 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">Scenarios（オプション）</label>
            <button
              type="button"
              onClick={addScenario}
              disabled={isLoading || isGenerating}
              className="inline-flex items-center space-x-1 text-sm text-blue-600 hover:text-blue-800 disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              <span>シナリオ追加</span>
            </button>
          </div>

          <p className="text-sm text-gray-600 mb-4">
            よく使用するやり取りのパターンをシナリオとして登録できます。シナリオのタイトルと具体的な内容を入力してください。
          </p>

          <div className="space-y-3">
            {formData.scenarios.map((scenario, index) => (
              <div key={index} className="flex items-center space-x-3">
                {/* タイトル（左側・小さめ） */}
                <div className="flex-shrink-0 w-48">
                  <input
                    type="text"
                    value={scenario.title}
                    onChange={(e) => updateScenario(index, 'title', e.target.value)}
                    disabled={isLoading || isGenerating}
                    placeholder="例: Python基礎レッスン"
                    className={`w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed ${
                      errors[`scenario_title_${index}`] ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {errors[`scenario_title_${index}`] && (
                    <div className="flex items-center space-x-1 mt-1">
                      <AlertCircle className="w-3 h-3 text-red-500" />
                      <span className="text-xs text-red-600">
                        {errors[`scenario_title_${index}`]}
                      </span>
                    </div>
                  )}
                </div>

                {/* プロンプト（右側・大きめ） */}
                <div className="flex-1">
                  <input
                    type="text"
                    value={scenario.prompt}
                    onChange={(e) => updateScenario(index, 'prompt', e.target.value)}
                    disabled={isLoading || isGenerating}
                    placeholder="例: Pythonの基本文法について説明してください"
                    className={`w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed ${
                      errors[`scenario_prompt_${index}`] ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {errors[`scenario_prompt_${index}`] && (
                    <div className="flex items-center space-x-1 mt-1">
                      <AlertCircle className="w-3 h-3 text-red-500" />
                      <span className="text-xs text-red-600">
                        {errors[`scenario_prompt_${index}`]}
                      </span>
                    </div>
                  )}
                </div>

                {/* 削除ボタン（最右端） */}
                <button
                  type="button"
                  onClick={() => removeScenario(index)}
                  disabled={isLoading || isGenerating}
                  className="flex-shrink-0 text-gray-400 hover:text-red-500 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* 空の状態 */}
          {formData.scenarios.length === 0 && (
            <div className="text-center py-4 text-gray-400 text-sm">
              シナリオを追加するには「シナリオ追加」ボタンをクリックしてください
            </div>
          )}
        </div>

        {/* ボタン */}
        <div className="flex items-center justify-end space-x-3 pt-6">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            キャンセル
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex items-center space-x-2 px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            <span>{isLoading ? '保存中...' : '保存'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};

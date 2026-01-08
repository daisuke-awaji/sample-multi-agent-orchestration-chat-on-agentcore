import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X, AlertCircle, Sparkles, Settings, Wrench, Server } from 'lucide-react';
import { ToolSelector } from './ToolSelector';
import { MCPConfigEditor } from './MCPConfigEditor';
import { IconPicker } from './ui/IconPicker';
import { SidebarTabsLayout, type TabItem } from './ui/SidebarTabs';
import type { CreateAgentInput, Agent, Scenario } from '../types/agent';
import { streamAgentResponse, createAgentConfigGenerationPrompt } from '../api/agent';
import { useToolStore } from '../stores/toolStore';
import { parseStreamingXml, createInitialXmlState } from '../utils/xmlParser';
import { translateIfKey } from '../utils/agent-translation';

interface AgentFormProps {
  agent?: Agent;
  onSubmit: (data: CreateAgentInput) => void;
  isLoading?: boolean;
}

type TabType = 'basic' | 'tools' | 'mcp';

export const AgentForm: React.FC<AgentFormProps> = ({ agent, onSubmit, isLoading = false }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>('basic');
  const [formData, setFormData] = useState<CreateAgentInput>(() => {
    if (agent) {
      return {
        name: translateIfKey(agent.name, t),
        description: translateIfKey(agent.description, t),
        icon: agent.icon || 'Bot',
        systemPrompt: agent.systemPrompt,
        enabledTools: [...agent.enabledTools],
        scenarios: agent.scenarios.map((s) => ({
          title: translateIfKey(s.title, t),
          prompt: translateIfKey(s.prompt, t),
        })),
        mcpConfig: agent.mcpConfig,
      };
    }
    return {
      name: '',
      description: '',
      icon: 'Bot',
      systemPrompt: '',
      enabledTools: [],
      scenarios: [],
      mcpConfig: undefined,
    };
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // AI generation related state
  const [isGenerating, setIsGenerating] = useState(false);

  const { tools } = useToolStore();

  // Validation
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = t('agent.validationNameRequired');
    } else if (formData.name.length > 50) {
      newErrors.name = t('agent.validationNameTooLong');
    }

    if (!formData.description.trim()) {
      newErrors.description = t('agent.validationDescriptionRequired');
    } else if (formData.description.length > 200) {
      newErrors.description = t('agent.validationDescriptionTooLong');
    }

    if (!formData.systemPrompt.trim()) {
      newErrors.systemPrompt = t('agent.validationSystemPromptRequired');
    } else if (formData.systemPrompt.length < 10) {
      newErrors.systemPrompt = t('agent.validationSystemPromptTooShort');
    }

    // シナリオのバリデーション
    formData.scenarios.forEach((scenario, index) => {
      if (!scenario.title.trim()) {
        newErrors[`scenario_title_${index}`] = t('agent.validationScenarioTitleRequired');
      }
      if (!scenario.prompt.trim()) {
        newErrors[`scenario_prompt_${index}`] = t('agent.validationScenarioPromptRequired');
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

    // Clear errors
    if (errors[`scenario_${field}_${index}`]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[`scenario_${field}_${index}`];
        return newErrors;
      });
    }
  };

  // AI generation feature
  const handleAIGeneration = async () => {
    if (!formData.name.trim() || !formData.description.trim()) {
      return;
    }

    setIsGenerating(true);

    // XMLパース状態を初期化
    const initialParseState = createInitialXmlState();

    // 利用可能なツール名を取得
    const availableTools = tools.map((tool) => tool.name);

    // 生成プロンプトを作成
    const generationPrompt = createAgentConfigGenerationPrompt(
      formData.name,
      formData.description,
      availableTools
    );

    try {
      let currentParseState = initialParseState;
      let accumulatedXml = '';

      await streamAgentResponse(generationPrompt, undefined, {
        onTextDelta: (text: string) => {
          accumulatedXml += text;

          // XMLを逐次解析してフォームに反映
          const { state: newParseState, updates } = parseStreamingXml(
            accumulatedXml,
            currentParseState
          );
          currentParseState = newParseState;

          // System promptの更新
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
            generation: `${t('agent.validationGenerationFailed')}: ${error.message}`,
          }));
          setIsGenerating(false);
        },
      });
    } catch (error) {
      console.error('AI生成エラー:', error);
      setErrors((prev) => ({
        ...prev,
        generation: `${t('agent.validationGenerationFailed')}: ${error instanceof Error ? error.message : '不明なエラー'}`,
      }));
      setIsGenerating(false);
    }
  };

  // タブ設定
  const tabs: TabItem<TabType>[] = [
    { id: 'basic', label: t('agent.basicSettings'), icon: Settings },
    { id: 'tools', label: t('agent.toolsSettings'), icon: Wrench },
    { id: 'mcp', label: t('agent.mcpSettings'), icon: Server },
  ];

  return (
    <SidebarTabsLayout tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
      <form id="agent-form" onSubmit={handleSubmit} className="flex-1 flex flex-col">
        {/* パネルコンテンツ */}
        <div className="h-[80vh] overflow-y-auto px-6 py-6">
          {/* 基本設定パネル */}
          {activeTab === 'basic' && (
            <div className="space-y-6 max-w-5xl mx-auto">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">
                {t('agent.basicSettings')}
              </h2>

              {/* Agent name */}
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                  {t('agent.nameAndIcon')}
                </label>
                <p className="text-sm text-gray-500 mb-3">{t('agent.nameDescription')}</p>
                <div className="flex items-center space-x-3">
                  <IconPicker
                    value={formData.icon}
                    onChange={(icon) => setFormData((prev) => ({ ...prev, icon }))}
                    disabled={isLoading || isGenerating}
                  />
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
                    placeholder={t('agent.namePlaceholder')}
                    className={`flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed ${
                      errors.name ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                </div>
                {errors.name && (
                  <div className="flex items-center space-x-1 mt-2">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <span className="text-sm text-red-600">{errors.name}</span>
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <label
                  htmlFor="description"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  {t('agent.descriptionLabel')}
                </label>
                <p className="text-sm text-gray-500 mb-3">{t('agent.descriptionDescription')}</p>
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
                  placeholder={t('agent.descriptionPlaceholder2')}
                  rows={2}
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed resize-none ${
                    errors.description ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {errors.description && (
                  <div className="flex items-center space-x-1 mt-2">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <span className="text-sm text-red-600">{errors.description}</span>
                  </div>
                )}
              </div>

              {/* System prompt */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="systemPrompt" className="text-sm font-medium text-gray-700">
                    {t('agent.systemPromptRequired')}
                  </label>
                  {/* AI自動生成ボタン */}
                  <button
                    type="button"
                    onClick={handleAIGeneration}
                    disabled={
                      isLoading ||
                      isGenerating ||
                      !formData.name.trim() ||
                      !formData.description.trim()
                    }
                    className="inline-flex items-center space-x-1 px-3 py-1.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{isGenerating ? t('agent.aiGenerating') : t('agent.aiGenerate')}</span>
                  </button>
                </div>
                <p className="text-sm text-gray-500 mb-3">{t('agent.systemPromptDescription')}</p>
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
                  placeholder={t('agent.systemPromptPlaceholder2')}
                  rows={12}
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed resize-y font-mono text-sm ${
                    errors.systemPrompt ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {errors.systemPrompt && (
                  <div className="flex items-center space-x-1 mt-2">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <span className="text-sm text-red-600">{errors.systemPrompt}</span>
                  </div>
                )}
                {errors.generation && (
                  <div className="flex items-center space-x-1 mt-2">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <span className="text-sm text-red-600">{errors.generation}</span>
                  </div>
                )}
              </div>

              {/* シナリオ管理 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">
                    {t('agent.scenarios')}
                  </label>
                  <button
                    type="button"
                    onClick={addScenario}
                    disabled={isLoading || isGenerating}
                    className="inline-flex items-center space-x-1 text-sm text-blue-600 hover:text-blue-800 disabled:text-gray-400 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{t('agent.addScenario')}</span>
                  </button>
                </div>

                <p className="text-sm text-gray-500 mb-4">{t('agent.scenariosDescription')}</p>

                <div className="space-y-3">
                  {formData.scenarios.map((scenario, index) => (
                    <div key={index} className="flex items-start space-x-3">
                      {/* タイトル（左側） */}
                      <div className="flex-shrink-0 w-48">
                        <textarea
                          value={scenario.title}
                          onChange={(e) => updateScenario(index, 'title', e.target.value)}
                          disabled={isLoading || isGenerating}
                          placeholder={t('agent.scenarioTitlePlaceholder')}
                          rows={2}
                          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed resize-y ${
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

                      {/* プロンプト（右側） */}
                      <div className="flex-1">
                        <textarea
                          value={scenario.prompt}
                          onChange={(e) => updateScenario(index, 'prompt', e.target.value)}
                          disabled={isLoading || isGenerating}
                          placeholder={t('agent.scenarioPromptPlaceholder')}
                          rows={2}
                          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed resize-y ${
                            errors[`scenario_prompt_${index}`]
                              ? 'border-red-500'
                              : 'border-gray-300'
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

                      {/* 削除ボタン */}
                      <button
                        type="button"
                        onClick={() => removeScenario(index)}
                        disabled={isLoading || isGenerating}
                        className="flex-shrink-0 p-1 text-gray-400 hover:text-red-500 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* 空の状態 */}
                {formData.scenarios.length === 0 && (
                  <div className="text-center py-6 text-gray-400 text-sm bg-gray-50 rounded-lg border border-gray-200 border-dashed">
                    {t('agent.emptyScenarios')}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ツールパネル */}
          {activeTab === 'tools' && (
            <div className="space-y-6 max-w-5xl mx-auto">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">
                {t('agent.toolSelection')}
              </h2>
              <ToolSelector
                selectedTools={formData.enabledTools}
                onSelectionChange={(tools) =>
                  setFormData((prev) => ({ ...prev, enabledTools: tools }))
                }
                disabled={isLoading || isGenerating}
              />
            </div>
          )}

          {/* MCP パネル */}
          {activeTab === 'mcp' && (
            <div className="space-y-6 max-w-5xl mx-auto">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">
                {t('agent.mcpServerSettings')}
              </h2>
              <MCPConfigEditor
                config={formData.mcpConfig}
                onChange={(config) => setFormData((prev) => ({ ...prev, mcpConfig: config }))}
                disabled={isLoading || isGenerating}
              />
            </div>
          )}
        </div>
      </form>
    </SidebarTabsLayout>
  );
};

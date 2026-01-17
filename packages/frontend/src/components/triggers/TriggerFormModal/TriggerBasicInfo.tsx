/**
 * TriggerBasicInfo Component
 *
 * Basic information input for trigger (name, description, agent selection)
 */

import { useTranslation } from 'react-i18next';
import { useAgentStore } from '../../../stores/agentStore';

export interface TriggerBasicInfoProps {
  name: string;
  description: string;
  agentId: string;
  onNameChange: (name: string) => void;
  onDescriptionChange: (description: string) => void;
  onAgentIdChange: (agentId: string) => void;
  disabled?: boolean;
}

export function TriggerBasicInfo({
  name,
  description,
  agentId,
  onNameChange,
  onDescriptionChange,
  onAgentIdChange,
  disabled = false,
}: TriggerBasicInfoProps) {
  const { t } = useTranslation();
  const { agents } = useAgentStore();

  // Get display name for agent (translate if it's a translation key)
  const getAgentDisplayName = (agentName: string) => {
    // If name starts with 'defaultAgents.', it's a translation key
    if (agentName.startsWith('defaultAgents.')) {
      return t(agentName);
    }
    return agentName;
  };

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-base font-semibold text-gray-900">{t('triggers.form.basicInfo')}</h3>
        <p className="text-sm text-gray-500 mt-1">{t('triggers.form.basicInfoDescription')}</p>
      </div>

      <div className="space-y-4">
        {/* Trigger Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('triggers.form.name')} <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder={t('triggers.form.namePlaceholder')}
            disabled={disabled}
            maxLength={100}
            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
        </div>

        {/* Agent Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('triggers.form.agent')} <span className="text-red-500">*</span>
          </label>
          <select
            value={agentId}
            onChange={(e) => onAgentIdChange(e.target.value)}
            disabled={disabled}
            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          >
            <option value="">{t('triggers.form.agentPlaceholder')}</option>
            {agents.map((agent) => (
              <option key={agent.agentId} value={agent.agentId}>
                {getAgentDisplayName(agent.name)}
              </option>
            ))}
          </select>
          {agents.length === 0 && (
            <p className="mt-2 text-sm text-gray-500">{t('agent.noAgents')}</p>
          )}
        </div>

        {/* Description - Full width */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('triggers.form.description')}
          </label>
          <textarea
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder={t('triggers.form.descriptionPlaceholder')}
            disabled={disabled}
            maxLength={500}
            rows={3}
            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
        </div>
      </div>
    </div>
  );
}

/**
 * ModelSelector Component
 * Dropdown for selecting Bedrock models
 */

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';
import { AVAILABLE_MODELS, getModelById } from '../../../config/models';
import { useSettingsStore } from '../../../stores/settingsStore';

interface ModelSelectorProps {
  onModelChange?: (modelId: string) => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({ onModelChange }) => {
  const { selectedModelId, setSelectedModelId } = useSettingsStore();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedModel = getModelById(selectedModelId);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleModelSelect = (modelId: string) => {
    setSelectedModelId(modelId);
    setIsOpen(false);
    // Notify parent of change for session config saving
    onModelChange?.(modelId);
  };

  return (
    <div ref={dropdownRef} className="relative inline-block">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
      >
        <Sparkles className="w-4 h-4 text-gray-400" />
        <span className="font-medium">{selectedModel ? selectedModel.name : 'Select Model'}</span>
        {selectedModel && <span className="text-gray-400">({selectedModel.provider})</span>}
        <ChevronDown
          className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-72 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50">
          <div className="max-h-64 overflow-y-auto">
            {AVAILABLE_MODELS.map((model) => (
              <button
                key={model.id}
                type="button"
                onClick={() => handleModelSelect(model.id)}
                className={`w-full px-3 py-2 text-left hover:bg-gray-50 transition-colors ${
                  model.id === selectedModelId ? 'bg-blue-50' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900">{model.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{model.provider}</div>
                  </div>
                  {model.id === selectedModelId && (
                    <div className="w-2 h-2 rounded-full bg-blue-600 ml-2" />
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

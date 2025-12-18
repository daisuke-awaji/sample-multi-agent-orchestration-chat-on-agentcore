/**
 * 天気ツール - AgentCore Runtime のデモ用
 */

import { tool } from "@strands-agents/sdk";
import { z } from "zod";

/**
 * 天気情報取得ツール
 */
export const weatherTool = tool({
  name: "get_weather",
  description: "指定された都市の現在の天気情報を取得します。",
  inputSchema: z.object({
    location: z.string().describe("都市名（例：東京、大阪、ニューヨーク）"),
  }),
  callback: (input) => {
    // デモ用のダミーデータを返す
    const weatherData = {
      東京: {
        temperature: "22°C",
        conditions: "晴れ",
        humidity: "65%",
        windSpeed: "5 km/h",
      },
      大阪: {
        temperature: "24°C",
        conditions: "曇り",
        humidity: "70%",
        windSpeed: "3 km/h",
      },
      ニューヨーク: {
        temperature: "18°C",
        conditions: "雨",
        humidity: "80%",
        windSpeed: "12 km/h",
      },
    };

    const location = input.location;
    const weather = weatherData[location as keyof typeof weatherData];

    if (weather) {
      return `${location}の天気情報:
気温: ${weather.temperature}
天候: ${weather.conditions}
湿度: ${weather.humidity}
風速: ${weather.windSpeed}`;
    } else {
      // デフォルトの天気情報を返す
      return `${location}の天気情報:
気温: 20°C
天候: 晴れ
湿度: 60%
風速: 4 km/h

※ この地域の詳細な天気データは現在利用できません。一般的な天気情報を表示しています。`;
    }
  },
});

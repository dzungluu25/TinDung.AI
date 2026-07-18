import { useState, type FormEvent } from "react";
import { Send, Bot } from "lucide-react";
import { useAgentStream } from "../../hooks/useAgentStream";
import { SAMPLE_PROMPTS } from "./samplePrompts";

export const PromptComposer = () => {
  const [prompt, setPrompt] = useState("");
  const { run, phase } = useAgentStream();
  const isRunning = phase === "running";

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!prompt.trim() || isRunning) return;
    void run(prompt);
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-4xl mx-auto">
      {/* Khung Yêu cầu thẩm định */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-[#F7EFE3]">
          <h2 className="text-xl font-bold text-[#3D2B1F]">Yêu cầu thẩm định</h2>
        </div>
        
        <div className="p-6 bg-white">
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div className="relative">
              <textarea
                className="w-full bg-[#FDF9F1] rounded-xl p-5 text-[#3D2B1F] text-lg focus:outline-none focus:ring-2 focus:ring-[#8C5A35]/30 border border-[#E8DCC8] transition-all resize-none min-h-[150px]"
                placeholder="Nhập yêu cầu thẩm định tín dụng..."
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                disabled={isRunning}
                rows={4}
              />
              <div className="absolute bottom-4 right-4 bg-[#8C5A35] rounded-full p-2 shadow-sm">
                <Bot size={20} className="text-white" />
              </div>
            </div>

            <div className="flex justify-between items-start gap-6">
              <div className="flex flex-wrap gap-3">
                {SAMPLE_PROMPTS.map(sample => (
                  <button
                    key={sample.label}
                    type="button"
                    className="px-4 py-2 bg-white border border-[#E8DCC8] rounded-full text-sm text-[#7A5C43] hover:bg-[#FDF9F1] hover:text-[#59351A] hover:border-[#8C5A35] transition-colors disabled:opacity-50 font-medium"
                    disabled={isRunning}
                    onClick={() => setPrompt(sample.prompt)}
                  >
                    {sample.label}
                  </button>
                ))}
              </div>
              <button
                type="submit"
                disabled={!prompt.trim() || isRunning}
                className="flex items-center gap-2 bg-[#59351A] hover:bg-[#3D2B1F] text-white px-8 py-3.5 rounded-xl shadow-md transition-all disabled:opacity-50 whitespace-nowrap font-medium text-lg"
              >
                <Send size={20} className="text-[#F2E3D5]" />
                {isRunning ? "Đang xử lý..." : "Bắt đầu thẩm định"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

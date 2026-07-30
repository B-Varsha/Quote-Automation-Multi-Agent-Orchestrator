import React, { useState } from 'react';
import { Send, Upload, Sparkles, Image as ImageIcon, FileText, CheckCircle, Database, Layers } from 'lucide-react';

interface InquiryInputProps {
  onProcessText: (text: string) => Promise<void>;
  onProcessImage: (file: File, notes: string) => Promise<void>;
  isLoading: boolean;
}

const SAMPLE_PROMPTS = [
  {
    title: 'Adversarial Name ("Kebab Singh")',
    text: 'Hello, my name is Kebab Singh. Need catering for 50 people on Friday at 6:00 PM for delivery to 450 First St. Please prepare 2 trays of butter chicken, garlic naan, and gulab jamun.',
  },
  {
    title: 'Ambiguous Generic Dish ("Biryani & Naan")',
    text: 'Hi this is Priya Patel, we need biryani and naan for 30 guests tomorrow at 7:00 PM for delivery to 100 Main St San Jose.',
  },
  {
    title: 'Quantity vs Headcount ("50 plates for 50 people")',
    text: 'Hi, I am Anand Kumar. We need 50 plates of biryani and 50 samosas for 50 people this Saturday at 1:00 PM.',
  },
  {
    title: 'Off-Menu Custom Item ("Filter Coffee")',
    text: 'Hey Vikram here, party of 25 pax. Need 2 trays chicken tikka masala, 2 trays mango kulfi, and 1 tray special South Indian Filter Coffee.',
  },
  {
    title: 'Wedding Reception (120 Guests - Delivery)',
    text: 'Inquiry from Rajesh Sharma for a Wedding Reception on October 24, 2026 at 6:00 PM for 120 guests. Delivery to 125 Grand Blvd, San Jose. Requested menu: Hyderabadi Chicken Biryani, Special Goat Biryani, Chicken Tikka Masala, Palak Paneer, Samosas, Garlic Butter Naan, and Kesar Rasmalai.',
  },
];

export const InquiryInput: React.FC<InquiryInputProps> = ({
  onProcessText,
  onProcessImage,
  isLoading,
}) => {
  const [activeTab, setActiveTab] = useState<'text' | 'image'>('text');
  const [inquiryText, setInquiryText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [imageNotes, setImageNotes] = useState('');

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inquiryText.trim() || isLoading) return;
    onProcessText(inquiryText);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setFilePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleImageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || isLoading) return;
    onProcessImage(selectedFile, imageNotes);
  };

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-200">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-200/60">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Inquiry Ingestion Agent</h2>
            <p className="text-xs text-slate-500">Paste customer details or upload a photo of handwritten order</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 bg-slate-900 text-slate-100 text-[11px] font-semibold px-2.5 py-1 rounded-full border border-slate-800 shadow-2xs">
            <Database className="w-3.5 h-3.5 text-amber-400" />
            <span>Agentic RAG Store</span>
            <span className="bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded text-[10px] border border-amber-500/30 font-mono">
              gemini-embedding-2-preview
            </span>
          </div>

          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setActiveTab('text')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'text' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-amber-600" />
              <span>Text Inquiry</span>
            </button>
            <button
              onClick={() => setActiveTab('image')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'image' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5 text-amber-600" />
              <span>Image / Vision OCR</span>
            </button>
          </div>
        </div>
      </div>

      {/* Quick sample inquiry triggers */}
      <div className="mb-4">
        <p className="text-xs text-slate-500 mb-2 font-semibold">Quick Load Sample Inquiry:</p>
        <div className="flex flex-wrap gap-2">
          {SAMPLE_PROMPTS.map((prompt, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setActiveTab('text');
                setInquiryText(prompt.text);
              }}
              className="text-xs bg-slate-50 hover:bg-amber-50/80 text-slate-700 hover:text-amber-800 px-3 py-1.5 rounded-lg border border-slate-200 transition-colors text-left font-medium cursor-pointer"
            >
              {prompt.title}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'text' ? (
        <form onSubmit={handleTextSubmit}>
          <div className="relative mb-3">
            <textarea
              rows={4}
              value={inquiryText}
              onChange={(e) => setInquiryText(e.target.value)}
              placeholder="Paste raw customer email, WhatsApp message, or inquiry note... (e.g. 'Inquiry for 80 guests on Oct 20th...')"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-amber-600 focus:ring-1 focus:ring-amber-600 transition-all font-sans"
            />
          </div>

          <div className="flex justify-between items-center">
            <p className="text-xs text-slate-500">
              Grounded in <span className="text-amber-700 font-mono font-semibold">menu_prices.json</span> (Maharaja Catering Price Book)
            </p>
            <button
              type="submit"
              disabled={isLoading || !inquiryText.trim()}
              className="bg-amber-600 hover:bg-amber-700 text-white font-semibold px-4 py-2 rounded-xl text-xs flex items-center gap-2 shadow-xs disabled:opacity-50 transition-all cursor-pointer"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Processing Agents...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Run Multi-Agent Pipeline</span>
                </>
              )}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleImageSubmit}>
          <div className="border-2 border-dashed border-slate-200 hover:border-amber-500/60 rounded-xl p-5 text-center bg-slate-50/80 transition-all mb-3">
            {filePreview ? (
              <div className="flex flex-col items-center">
                <img src={filePreview} alt="Preview" className="max-h-48 rounded shadow-sm mb-2 object-contain" />
                <p className="text-xs text-amber-700 font-semibold flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                  {selectedFile?.name} loaded
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    setFilePreview(null);
                  }}
                  className="text-xs text-rose-600 hover:underline mt-1 font-medium cursor-pointer"
                >
                  Remove image
                </button>
              </div>
            ) : (
              <div>
                <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-xs text-slate-700 font-semibold">Upload Inquiry Image, Handwritten Note, or Menu Flyer</p>
                <p className="text-[11px] text-slate-500 mt-1">Supports PNG, JPG, WEBP. Analyzed by Gemini Vision API.</p>
                <label className="mt-3 inline-block bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 cursor-pointer shadow-xs transition-colors">
                  Choose File
                  <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                </label>
              </div>
            )}
          </div>

          <div className="mb-3">
            <input
              type="text"
              value={imageNotes}
              onChange={(e) => setImageNotes(e.target.value)}
              placeholder="Optional notes or instructions (e.g. 'Add extra samosas')"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-amber-600"
            />
          </div>

          <div className="flex justify-between items-center">
            <p className="text-xs text-slate-500">Worker 1: Gemini Vision OCR + Menu Matching</p>
            <button
              type="submit"
              disabled={isLoading || !selectedFile}
              className="bg-amber-600 hover:bg-amber-700 text-white font-semibold px-4 py-2 rounded-xl text-xs flex items-center gap-2 shadow-xs disabled:opacity-50 transition-all cursor-pointer"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Parsing Image...</span>
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  <span>Extract & Process Image</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

import { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, Settings2 } from 'lucide-react';

interface Message {
  id: number;
  text: string;
  sender: 'user' | 'ai';
}

const initialMessages: Message[] = [
  { id: 1, text: "Hi! I'm your tAIlor Personal Stylist. What's the occasion today, or do you have any specific needs I should keep in mind?", sender: 'ai' },
];

export default function Stylist() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const newMessage: Message = { id: Date.now(), text: input, sender: 'user' };
    setMessages(prev => [...prev, newMessage]);
    setInput('');

    // Simulate AI response
    setTimeout(() => {
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        text: "Got it. I've noted that requirement. I'll make sure to prioritize outfits with stretchy fabrics and avoid anything with complex buttons. I can update your daily generator with this preference if you'd like.",
        sender: 'ai'
      }]);
    }, 1200);
  };

  return (
    <div className="h-[calc(100vh-100px)] md:h-[calc(100vh-64px)] flex flex-col space-y-4 animate-in fade-in duration-500">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl md:text-4xl font-bold text-content">AI Stylist</h2>
          <p className="text-lg text-content-muted">Chat about measurements, quirks, and needs.</p>
        </div>
        <button 
          className="p-3 bg-surface border border-border rounded-full hover:bg-surface-muted transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
          aria-label="Stylist Settings"
        >
          <Settings2 className="w-6 h-6 text-content-muted" />
        </button>
      </header>

      {/* Chat Area */}
      <section 
        className="flex-1 bg-surface rounded-2xl shadow-sm border border-border flex flex-col overflow-hidden"
        aria-label="Chat window"
      >
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.map((msg) => (
            <div 
              key={msg.id} 
              className={`flex gap-4 max-w-[85%] ${msg.sender === 'user' ? 'ml-auto flex-row-reverse' : ''}`}
            >
              <div 
                className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                  msg.sender === 'user' ? 'bg-brand-orange text-white' : 'bg-brand-teal text-white'
                }`}
                aria-hidden="true"
              >
                {msg.sender === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
              </div>
              <div 
                className={`p-4 rounded-2xl text-lg ${
                  msg.sender === 'user' 
                    ? 'bg-brand-orange text-white rounded-tr-none' 
                    : 'bg-surface-raised text-content rounded-tl-none'
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}
          <div ref={endOfMessagesRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-surface-muted border-t border-border">
          <form onSubmit={handleSend} className="flex gap-2 relative">
            <input 
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g., I need something easy to put on for physical therapy..."
              className="flex-1 pl-4 pr-12 py-4 bg-surface border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-teal transition-shadow text-lg"
              aria-label="Message your AI stylist"
            />
            <button 
              type="submit"
              disabled={!input.trim()}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 p-2 bg-brand-teal hover:bg-brand-teal/90 text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-teal disabled:opacity-50"
              aria-label="Send message"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}

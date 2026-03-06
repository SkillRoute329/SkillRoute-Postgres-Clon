import { useState, useEffect } from 'react';
import { Search, MessageCircle, ExternalLink } from 'lucide-react';

const AdminWhatsApp = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/users')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setUsers(data);
        } else {
          console.error('API Error:', data);
          setUsers([]);
        }
      })
      .catch((err) => {
        console.error('Error fetching users', err);
        setUsers([]);
      });
  }, []);

  const safeUsers = Array.isArray(users) ? users : [];
  const filteredUsers = safeUsers.filter(
    (u: any) =>
      u.fullName?.toLowerCase().includes(search.toLowerCase()) ||
      u.internalNumber?.includes(search),
  );

  const openWhatsAppWeb = () => {
    window.open('https://web.whatsapp.com', '_blank');
  };

  const openChat = (phone: string | null) => {
    if (!phone) return alert('El usuario no tiene número registrado');
    // Clean phone number
    const cleanPhone = phone.replace(/\D/g, '');
    window.open(`https://wa.me/${cleanPhone}`, '_blank');
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">Centro de Comunicaciones</h1>
          <p className="text-slate-400">Gestiona el contacto con los usuarios vía WhatsApp.</p>
        </div>
        <button
          onClick={openWhatsAppWeb}
          className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-medium transition-colors shadow-lg shadow-green-900/20"
        >
          <MessageCircle className="w-5 h-5" />
          Abrir WhatsApp Web
        </button>
      </div>

      <div className="glass-panel p-6 rounded-2xl border border-slate-700">
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar usuario por nombre o interno..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl pl-9 pr-4 py-3 focus:border-primary-500 focus:outline-none transition-all"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredUsers.map((user) => (
            <div
              key={user.id}
              className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 flex justify-between items-center group hover:border-slate-600 transition-colors"
            >
              <div>
                <div className="font-bold text-white">{user.fullName}</div>
                <div className="text-xs text-slate-400">Interno: {user.internalNumber}</div>
                <div className="text-xs text-slate-500 mt-1">
                  {user.phoneNumber || 'Sin celular'}
                </div>
              </div>
              <button
                onClick={() => openChat(user.phoneNumber)}
                disabled={!user.phoneNumber}
                className="p-2 bg-slate-700 text-slate-300 rounded-lg group-hover:bg-green-600 group-hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                title="Enviar mensaje"
              >
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>
          ))}
          {filteredUsers.length === 0 && (
            <div className="col-span-full text-center py-8 text-slate-500">
              No se encontraron usuarios.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminWhatsApp;

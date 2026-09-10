import React, { useState, useEffect } from 'react';
import MinecraftButton from './MinecraftButton';
import MinecraftPanel from './MinecraftPanel';
import Capybara from './Capybara';

// Lembre-se de colocar a sua URL real do Render aqui!
const API_URL = "https://capyos.onrender.com";

export default function AppAplicadores() {
  const [token, setToken] = useState(localStorage.getItem('capy_token') || '');
  const [usuarioNome, setUsuarioNome] = useState(localStorage.getItem('capy_nome') || '');
  const [loginInput, setLoginInput] = useState('');
  const [senhaInput, setSenhaInput] = useState('');
  const [pendencias, setPendencias] = useState([]);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setErro('');
    setCarregando(true);

    try {
      const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: loginInput, senha: senhaInput })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Erro ao fazer login');
      }

      localStorage.setItem('capy_token', data.access_token);
      localStorage.setItem('capy_nome', data.nome);
      setToken(data.access_token);
      setUsuarioNome(data.nome);
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  };

  const carregarPendencias = async () => {
    try {
      const response = await fetch(`${API_URL}/pendencias`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.status === 401) {
        handleLogout();
        return;
      }

      const data = await response.json();
      setPendencias(data);
    } catch (err) {
      console.error("Erro ao buscar pendências:", err);
    }
  };

  const toggleFeito = async (id, statusAtual) => {
    const novoStatus = !statusAtual;
    
    setPendencias(pendencias.map(p => p.id === id ? { ...p, feito: novoStatus } : p));

    try {
      const response = await fetch(`${API_URL}/pendencias/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ feito: novoStatus })
      });

      if (!response.ok) {
        setPendencias(pendencias.map(p => p.id === id ? { ...p, feito: statusAtual } : p));
      }
    } catch (err) {
      console.error("Erro ao atualizar status:", err);
      setPendencias(pendencias.map(p => p.id === id ? { ...p, feito: statusAtual } : p));
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('capy_token');
    localStorage.removeItem('capy_nome');
    setToken('');
    setUsuarioNome('');
    setPendencias([]);
  };

  useEffect(() => {
    if (token) {
      carregarPendencias();
    }
  }, [token]);

  // ==========================================
  // TELA DE LOGIN (Estilo Minecraft)
  // ==========================================
  if (!token) {
    return (
      <div style={{ width: '100%', maxWidth: '400px', margin: '40px auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        
        <div style={{ marginBottom: 16 }}>
          <Capybara pose="andando" />
        </div>
        
        <h2 className="mc-title" style={{ fontSize: 24, marginBottom: 20, textAlign: 'center' }}>
          CapyOS <br/> <span style={{ fontSize: 16, color: '#F0F8FF' }}>Aplicadores</span>
        </h2>

        <div style={{ width: '100%' }}>
          <MinecraftPanel title="Acesso Restrito">
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '10px' }}>
              <input 
                type="text" 
                placeholder="Seu login" 
                value={loginInput}
                onChange={(e) => setLoginInput(e.target.value)}
                style={{ 
                  padding: '12px', 
                  fontFamily: '"Press Start 2P", monospace', 
                  fontSize: '12px', 
                  border: '2px solid #555', 
                  backgroundColor: '#d9d9d9', 
                  outline: 'none',
                  boxShadow: 'inset 2px 2px 0px rgba(0,0,0,0.3)'
                }}
                required
              />
              <input 
                type="password" 
                placeholder="Sua senha" 
                value={senhaInput}
                onChange={(e) => setSenhaInput(e.target.value)}
                style={{ 
                  padding: '12px', 
                  fontFamily: '"Press Start 2P", monospace', 
                  fontSize: '12px', 
                  border: '2px solid #555', 
                  backgroundColor: '#d9d9d9', 
                  outline: 'none',
                  boxShadow: 'inset 2px 2px 0px rgba(0,0,0,0.3)'
                }}
                required
              />
              
              <MinecraftButton type="submit" onClick={() => {}}>
                {carregando ? 'Entrando...' : 'Entrar'}
              </MinecraftButton>
              
              {erro && <p style={{ color: '#ff5555', fontSize: '12px', textAlign: 'center', margin: 0, textShadow: '1px 1px 0 #000' }}>{erro}</p>}
            </form>
          </MinecraftPanel>
        </div>
      </div>
    );
  }

  // ==========================================
  // TELA PRINCIPAL DE PENDÊNCIAS (Estilo Minecraft)
  // ==========================================
  return (
    <div style={{ width: '100%', maxWidth: '600px', margin: '20px auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '24px' }}>
        <div>
          <h2 className="mc-title" style={{ fontSize: 18, margin: 0, textAlign: 'left' }}>Olá, {usuarioNome} 💜</h2>
          <p style={{ color: '#F0F8FF', textShadow: '2px 2px 0 rgba(0,0,0,0.35)', fontSize: '14px', margin: '4px 0 0 0' }}>Suas pendências de titas</p>
        </div>
        <div>
          <MinecraftButton onClick={handleLogout}>Sair</MinecraftButton>
        </div>
      </div>

      {/* Lista de Titas */}
      <div style={{ width: '100%' }}>
        <MinecraftPanel title="Lista de Titas">
          {pendencias.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#555', margin: '30px 0', fontSize: '14px', fontFamily: '"Press Start 2P", monospace', lineHeight: '1.5' }}>
              Nenhuma pendência<br/>encontrada por enquanto! 🎉
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
              {pendencias.map((p) => (
                <div 
                  key={p.id} 
                  onClick={() => toggleFeito(p.id, p.feito)}
                  style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    padding: '14px', 
                    backgroundColor: p.feito ? '#a8e6cf' : '#C6C6C6', 
                    border: '2px solid',
                    borderColor: p.feito ? '#3b7d4f' : '#fff #555 #555 #fff',
                    boxShadow: p.feito ? 'inset -2px -2px 0px rgba(0,0,0,0.2)' : 'inset -2px -2px 0px #555, inset 2px 2px 0px #fff',
                    cursor: 'pointer',
                    imageRendering: 'pixelated'
                  }}
                >
                  <div style={{ fontFamily: '"Press Start 2P", monospace' }}>
                    <div style={{ fontSize: '10px', color: '#333', marginBottom: '8px' }}>
                      {p.data} ({p.dia_semana}) - {p.horario}
                    </div>
                    <div style={{ fontSize: '12px', color: '#000', lineHeight: '1.4' }}>
                      Tita: <strong style={{ color: p.feito ? '#1d5930' : '#000' }}>{p.tita}</strong>
                    </div>
                    {p.observacao && <div style={{ fontSize: '9px', color: '#555', marginTop: '6px' }}>Obs: {p.observacao}</div>}
                  </div>
                  <div style={{ fontSize: '24px', textShadow: '1px 1px 0 rgba(0,0,0,0.3)', marginLeft: '10px' }}>
                    {p.feito ? '✅' : '⬜'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </MinecraftPanel>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import MinecraftButton from './MinecraftButton';
import MinecraftPanel from './MinecraftPanel';
import Capybara from './Capybara';

// Lembre-se de colocar a sua URL real do Render aqui!
const API_URL = "https://capyos.onrender.com";

export default function AppAplicadores() {
  const [token, setToken] = useState(localStorage.getItem('capy_token') || '');
  const [usuarioNome, setUsuarioNome] = useState(localStorage.getItem('capy_nome') || '');
  const [usuarioPapel, setUsuarioPapel] = useState(localStorage.getItem('capy_papel') || '');
  const [loginInput, setLoginInput] = useState('');
  const [senhaInput, setSenhaInput] = useState('');
  const [pendencias, setPendencias] = useState([]);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  // PONTO 3: controle de dropdown aberto/fechado por aplicador (aberto por padrão)
  const [gruposAbertos, setGruposAbertos] = useState({});

  // CADASTRO EM MASSA (coordenação)
  const [textoBulk, setTextoBulk] = useState('');
  const [carregandoBulk, setCarregandoBulk] = useState(false);
  const [resultadoBulk, setResultadoBulk] = useState(null);
  const [mostrarCadastroBulk, setMostrarCadastroBulk] = useState(false);

  // FILA DE APROVAÇÃO DE REMOÇÃO (coordenação)
  const [selecionadosRemocao, setSelecionadosRemocao] = useState([]);
  const [carregandoRemocao, setCarregandoRemocao] = useState(false);
  const [mostrarFilaAprovacao, setMostrarFilaAprovacao] = useState(false);

  const isCoordenacao = usuarioPapel === 'coordenacao';

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
      localStorage.setItem('capy_papel', data.papel);
      setToken(data.access_token);
      setUsuarioNome(data.nome);
      setUsuarioPapel(data.papel);
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
    localStorage.removeItem('capy_papel');
    setToken('');
    setUsuarioNome('');
    setUsuarioPapel('');
    setPendencias([]);
  };

  // ==========================================
  // PONTO 1: CADASTRO EM MASSA
  // ==========================================
  const handleEnviarBulk = async () => {
    if (!textoBulk.trim()) return;
    setCarregandoBulk(true);
    setResultadoBulk(null);

    try {
      const response = await fetch(`${API_URL}/pendencias/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ texto: textoBulk })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Erro ao cadastrar em massa');
      }

      setResultadoBulk(data);
      if (data.inseridos > 0) {
        setTextoBulk('');
        carregarPendencias();
      }
    } catch (err) {
      setResultadoBulk({ inseridos: 0, erros: [err.message] });
    } finally {
      setCarregandoBulk(false);
    }
  };

  // ==========================================
  // PONTO 2: FILA DE APROVAÇÃO / REMOÇÃO EM LOTE
  // ==========================================
  const toggleSelecaoRemocao = (id) => {
    setSelecionadosRemocao(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleConfirmarRemocao = async () => {
    if (selecionadosRemocao.length === 0) return;
    setCarregandoRemocao(true);

    try {
      const response = await fetch(`${API_URL}/pendencias/lote`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ids: selecionadosRemocao })
      });

      if (response.ok) {
        setSelecionadosRemocao([]);
        carregarPendencias();
      }
    } catch (err) {
      console.error("Erro ao confirmar remoção em lote:", err);
    } finally {
      setCarregandoRemocao(false);
    }
  };

  useEffect(() => {
    if (token) {
      carregarPendencias();
    }
  }, [token]);

  // AGRUPA AS PENDÊNCIAS POR APLICADOR
  const pendenciasAgrupadas = pendencias.reduce((acc, p) => {
    if (!acc[p.aplicador]) acc[p.aplicador] = [];
    acc[p.aplicador].push(p);
    return acc;
  }, {});

  // PONTO 3: dentro de cada aplicador, não-feitos primeiro (mais antigos no topo),
  // feitos sempre no final
  const ordenarPendenciasDoAplicador = (lista) => {
    const naoFeitas = lista
      .filter(p => !p.feito)
      .sort((a, b) => b.dias_pendente - a.dias_pendente);
    const feitas = lista
      .filter(p => p.feito)
      .sort((a, b) => (a.data > b.data ? 1 : -1));
    return [...naoFeitas, ...feitas];
  };

  // Um grupo começa aberto por padrão, a não ser que o usuário já tenha fechado
  const grupoEstaAberto = (aplicador) =>
    gruposAbertos[aplicador] === undefined ? true : gruposAbertos[aplicador];

  const toggleGrupo = (aplicador) => {
    setGruposAbertos(prev => ({ ...prev, [aplicador]: !grupoEstaAberto(aplicador) }));
  };

  const textoDiasPendente = (dias) => {
    if (dias <= 0) return 'pendente hoje';
    if (dias === 1) return 'pendente há 1 dia';
    return `pendente há ${dias} dias`;
  };

  const pendenciasParaAprovacao = pendencias.filter(p => p.feito);

  // ==========================================
  // TELA DE LOGIN
  // ==========================================
  if (!token) {
    return (
      <div style={{ width: '100%', maxWidth: '400px', margin: '40px auto', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 20px', boxSizing: 'border-box' }}>
        <div style={{ marginBottom: 16 }}>
          <Capybara pose="andando" />
        </div>
        <h2 className="mc-title" style={{ fontSize: 20, marginBottom: 20, textAlign: 'center', lineHeight: '1.4' }}>
          CapyOS <br/> <span style={{ fontSize: 14, color: '#F0F8FF' }}>Aplicadores</span>
        </h2>
        <div style={{ width: '100%' }}>
          <MinecraftPanel title="Acesso Restrito">
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '10px' }}>
              <input type="text" placeholder="Seu login" value={loginInput} onChange={(e) => setLoginInput(e.target.value)} style={{ padding: '12px', fontFamily: '"Press Start 2P", monospace', fontSize: '12px', border: '2px solid #555', backgroundColor: '#d9d9d9', outline: 'none', boxShadow: 'inset 2px 2px 0px rgba(0,0,0,0.3)' }} required />
              <input type="password" placeholder="Sua senha" value={senhaInput} onChange={(e) => setSenhaInput(e.target.value)} style={{ padding: '12px', fontFamily: '"Press Start 2P", monospace', fontSize: '12px', border: '2px solid #555', backgroundColor: '#d9d9d9', outline: 'none', boxShadow: 'inset 2px 2px 0px rgba(0,0,0,0.3)' }} required />
              <MinecraftButton type="submit" onClick={() => {}}>{carregando ? 'Entrando...' : 'Entrar'}</MinecraftButton>
              {erro && <p style={{ color: '#ff5555', fontSize: '12px', textAlign: 'center', margin: 0, textShadow: '1px 1px 0 #000' }}>{erro}</p>}
            </form>
          </MinecraftPanel>
        </div>
      </div>
    );
  }

  // ==========================================
  // TELA PRINCIPAL DE PENDÊNCIAS
  // ==========================================
  return (
    <div style={{ width: '100%', maxWidth: '600px', margin: '20px auto', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 16px', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '24px', gap: '10px' }}>
        <div style={{ flex: 1 }}>
          <h2 className="mc-title" style={{ fontSize: 16, margin: 0, textAlign: 'left', lineHeight: '1.3' }}>Olá, {usuarioNome} 💜</h2>
          <p style={{ color: '#F0F8FF', textShadow: '2px 2px 0 rgba(0,0,0,0.35)', fontSize: '12px', margin: '4px 0 0 0' }}>
            {isCoordenacao ? 'Visão Geral (Coordenação)' : 'Suas pendências'}
          </p>
        </div>
        <div>
          <MinecraftButton onClick={handleLogout}>Sair</MinecraftButton>
        </div>
      </div>

      {/* ========================================== */}
      {/* PONTO 1: CADASTRO EM MASSA (só coordenação) */}
      {/* ========================================== */}
      {isCoordenacao && (
        <div style={{ width: '100%', marginBottom: '20px' }}>
          <MinecraftPanel title="Cadastro em Massa">
            <div
              onClick={() => setMostrarCadastroBulk(!mostrarCadastroBulk)}
              style={{ cursor: 'pointer', fontFamily: '"Press Start 2P", monospace', fontSize: '10px', color: '#111', textShadow: '1px 1px 0px #fff', padding: '4px 0', userSelect: 'none' }}
            >
              {mostrarCadastroBulk ? '▼' : '▶'} Colar titas pendentes
            </div>

            {mostrarCadastroBulk && (
              <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <p style={{ fontSize: '9px', color: '#333', lineHeight: '1.6', margin: 0 }}>
                  Uma linha por tita, campos separados por ";":<br/>
                  <strong>DATA;HORARIO;TITA;APLICADOR;OBSERVACAO</strong><br/>
                  (DATA no formato DD/MM/AAAA · OBSERVACAO é opcional)
                </p>
                <textarea
                  value={textoBulk}
                  onChange={(e) => setTextoBulk(e.target.value)}
                  placeholder={"11/09/2026;14:00;João Pedro;Ana Clara;Levar material\n12/09/2026;09:30;Maria Luiza;Bruno Costa;"}
                  rows={5}
                  style={{ padding: '10px', fontFamily: 'monospace', fontSize: '12px', border: '2px solid #555', backgroundColor: '#d9d9d9', outline: 'none', boxShadow: 'inset 2px 2px 0px rgba(0,0,0,0.3)', resize: 'vertical' }}
                />
                <MinecraftButton onClick={handleEnviarBulk} disabled={carregandoBulk || !textoBulk.trim()}>
                  {carregandoBulk ? 'Enviando...' : 'Cadastrar Titas'}
                </MinecraftButton>

                {resultadoBulk && (
                  <div style={{ fontSize: '10px', fontFamily: '"Press Start 2P", monospace', lineHeight: '1.8' }}>
                    <p style={{ color: '#1d5930', margin: '4px 0' }}>✅ {resultadoBulk.inseridos} tita(s) cadastrado(s)</p>
                    {resultadoBulk.erros.length > 0 && (
                      <div style={{ color: '#a83232' }}>
                        {resultadoBulk.erros.map((e, i) => (
                          <p key={i} style={{ margin: '2px 0', fontFamily: 'monospace', fontSize: '11px' }}>⚠️ {e}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </MinecraftPanel>
        </div>
      )}

      {/* ================================================= */}
      {/* PONTO 2: FILA DE APROVAÇÃO DE REMOÇÃO (coordenação) */}
      {/* ================================================= */}
      {isCoordenacao && pendenciasParaAprovacao.length > 0 && (
        <div style={{ width: '100%', marginBottom: '20px' }}>
          <MinecraftPanel title="Fila de Aprovação">
            <div
              onClick={() => setMostrarFilaAprovacao(!mostrarFilaAprovacao)}
              style={{ cursor: 'pointer', fontFamily: '"Press Start 2P", monospace', fontSize: '10px', color: '#111', textShadow: '1px 1px 0px #fff', padding: '4px 0', userSelect: 'none' }}
            >
              {mostrarFilaAprovacao ? '▼' : '▶'} {pendenciasParaAprovacao.length} tita(s) aguardando remoção
            </div>

            {mostrarFilaAprovacao && (
              <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {pendenciasParaAprovacao.map((p) => (
                    <label
                      key={p.id}
                      style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', backgroundColor: '#a8e6cf', border: '2px solid #3b7d4f', cursor: 'pointer', fontFamily: '"Press Start 2P", monospace', fontSize: '10px', color: '#000' }}
                    >
                      <input
                        type="checkbox"
                        checked={selecionadosRemocao.includes(p.id)}
                        onChange={() => toggleSelecaoRemocao(p.id)}
                        style={{ width: '16px', height: '16px', flexShrink: 0 }}
                      />
                      <span>{p.tita} <span style={{ color: '#333' }}>({p.aplicador} · {p.data})</span></span>
                    </label>
                  ))}
                </div>
                <MinecraftButton onClick={handleConfirmarRemocao} disabled={carregandoRemocao || selecionadosRemocao.length === 0}>
                  {carregandoRemocao ? 'Removendo...' : `Confirmar remoção (${selecionadosRemocao.length})`}
                </MinecraftButton>
              </div>
            )}
          </MinecraftPanel>
        </div>
      )}

      {/* ========================================== */}
      {/* LISTA PRINCIPAL DE PENDÊNCIAS POR APLICADOR */}
      {/* ========================================== */}
      <div style={{ width: '100%' }}>
        <MinecraftPanel title="Lista de Titas">
          {pendencias.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#555', margin: '30px 0', fontSize: '12px', fontFamily: '"Press Start 2P", monospace', lineHeight: '1.6' }}>
              Nenhuma pendência<br/>encontrada por<br/>enquanto! 🎉
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '10px' }}>

              {/* RENDERIZAÇÃO CATEGORIZADA POR APLICADOR */}
              {Object.keys(pendenciasAgrupadas).map((aplicador) => {
                const listaOrdenada = ordenarPendenciasDoAplicador(pendenciasAgrupadas[aplicador]);
                const totalPendentes = listaOrdenada.filter(p => !p.feito).length;
                const aberto = grupoEstaAberto(aplicador);

                return (
                  <div key={aplicador}>
                    {/* Título da Categoria (clicável = dropdown) + contador alinhado à direita */}
                    <div
                      onClick={() => toggleGrupo(aplicador)}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none', margin: '0 0 10px 0', borderBottom: '2px solid #555', paddingBottom: '6px' }}
                    >
                      <h3 style={{ fontFamily: '"Press Start 2P", monospace', fontSize: '10px', color: '#111', textShadow: '1px 1px 0px #fff', margin: 0 }}>
                        {aberto ? '▼' : '▶'} {aplicador}
                      </h3>
                      <span style={{ fontFamily: '"Press Start 2P", monospace', fontSize: '10px', color: totalPendentes > 0 ? '#a83232' : '#1d5930', textShadow: '1px 1px 0px #fff' }}>
                        {totalPendentes} pendente{totalPendentes !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {/* Cards do Aplicador */}
                    {aberto && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {listaOrdenada.map((p) => (
                          <div
                            key={p.id}
                            onClick={() => toggleFeito(p.id, p.feito)}
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px', backgroundColor: p.feito ? '#a8e6cf' : '#C6C6C6', border: '2px solid', borderColor: p.feito ? '#3b7d4f' : '#fff #555 #555 #fff', boxShadow: p.feito ? 'inset -2px -2px 0px rgba(0,0,0,0.2)' : 'inset -2px -2px 0px #555, inset 2px 2px 0px #fff', cursor: 'pointer', imageRendering: 'pixelated' }}
                          >
                            <div style={{ fontFamily: '"Press Start 2P", monospace' }}>
                              <div style={{ fontSize: '10px', color: '#333', marginBottom: '8px' }}>{p.data} ({p.dia_semana}) - {p.horario}</div>
                              <div style={{ fontSize: '12px', color: '#000', lineHeight: '1.4' }}>Tita: <strong style={{ color: p.feito ? '#1d5930' : '#000' }}>{p.tita}</strong></div>
                              {!p.feito && (
                                <div style={{ fontSize: '9px', color: p.dias_pendente >= 3 ? '#a83232' : '#555', marginTop: '6px' }}>
                                  ⏳ {textoDiasPendente(p.dias_pendente)}
                                </div>
                              )}
                              {p.observacao && <div style={{ fontSize: '9px', color: '#555', marginTop: '6px' }}>Obs: {p.observacao}</div>}
                            </div>
                            <div style={{ fontSize: '24px', textShadow: '1px 1px 0 rgba(0,0,0,0.3)', marginLeft: '10px' }}>
                              {p.feito ? '✅' : '⬜'}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

            </div>
          )}
        </MinecraftPanel>
      </div>
    </div>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import MinecraftButton from './MinecraftButton';
import MinecraftPanel from './MinecraftPanel';
import Capybara from './Capybara';
import TelaGerarEscala from './TelaGerarEscala';
import TelaPacientes from './TelaPacientes';
import TelaConfiguracoes from './TelaConfiguracoes';
import TelaLoading from './TelaLoading';

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

  // Tela de "Acordando o servidor": antes só existia no caminho antigo da raiz
  // ("/"); agora que "/" e "/aplicador" caem no mesmo app, vale pra todo
  // mundo — evita tentar logar com o backend (Render free tier) ainda dormindo.
  const [acordandoServidor, setAcordandoServidor] = useState(true);

  // ITEM 5/6/7: navegação em estilo menu (igual o CapyOS de alocação de salas)
  const [tela, setTela] = useState('home'); // home (dashboard) | titas | relatar-aba | cadastro-massa | relatos-aba | gerenciar-usuarios | gerar-escala | salas-pacientes | salas-configuracoes
  const [menuAberto, setMenuAberto] = useState(false);
  const [menuSecoesAbertas, setMenuSecoesAbertas] = useState({ pendencias: true, configuracoes: false });
  const [dashboardStats, setDashboardStats] = useState(null);
  const [carregandoDashboard, setCarregandoDashboard] = useState(false);

  // PONTO 3: controle de dropdown aberto/fechado por aplicador (aberto por padrão)
  const [gruposAbertos, setGruposAbertos] = useState({});

  // CADASTRO EM MASSA (coordenação)
  const [textoBulk, setTextoBulk] = useState('');
  const [carregandoBulk, setCarregandoBulk] = useState(false);
  const [resultadoBulk, setResultadoBulk] = useState(null);

  // FILA DE APROVAÇÃO DE REMOÇÃO (coordenação)
  const [selecionadosRemocao, setSelecionadosRemocao] = useState([]);
  const [carregandoRemocao, setCarregandoRemocao] = useState(false);
  // GRUPO 2: confirmação dupla antes de remover em lote (arma no 1º clique, executa no 2º)
  const [confirmandoRemocaoLote, setConfirmandoRemocaoLote] = useState(false);
  const confirmarRemocaoTimeoutRef = useRef(null);

  // GRUPO 2: busca por aplicador na Lista de Titas (só coordenação, item 1 das novas sugestões)
  const [buscaAplicador, setBuscaAplicador] = useState('');

  // GESTÃO DE USUÁRIOS/LOGINS (coordenação)
  const [usuarios, setUsuarios] = useState([]);
  const [novoNome, setNovoNome] = useState('');
  const [novoLogin, setNovoLogin] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [novoPapel, setNovoPapel] = useState('aplicador');
  const [carregandoUsuario, setCarregandoUsuario] = useState(false);
  const [erroUsuario, setErroUsuario] = useState('');
  const [removendoLogin, setRemovendoLogin] = useState('');

  // GRUPO 3: painel "Gerenciar Aplicadores" agora é uma tela do menu (item 6)
  // (antes era um modal atrás de um ícone de engrenagem)

  // RELATOS DE SESSÃO SEM ABA NO TITA (aberto a aplicador + coordenação)
  const DIAS_SEMANA_RELATO = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const HORARIOS_RELATO = ['13:15', '14:00', '14:45', '15:30', '16:15', '17:00', '17:45'];

  const [listaAssistidos, setListaAssistidos] = useState([]);
  const [relatoBuscaAssistido, setRelatoBuscaAssistido] = useState('');
  const [relatoAssistidoEscolhido, setRelatoAssistidoEscolhido] = useState('');
  const [relatoDropdownAberto, setRelatoDropdownAberto] = useState(false);
  const [relatoModoManual, setRelatoModoManual] = useState(false);
  const [relatoAssistidoManual, setRelatoAssistidoManual] = useState('');
  const [relatoDiaSemana, setRelatoDiaSemana] = useState('');
  // item 2 das novas sugestões: agora é multi-seleção (checkbox), um relato por horário marcado
  const [relatoHorarios, setRelatoHorarios] = useState([]);
  const [relatoTipo, setRelatoTipo] = useState('');
  const [relatoObservacao, setRelatoObservacao] = useState('');
  const [enviandoRelato, setEnviandoRelato] = useState(false);
  const [mensagemRelato, setMensagemRelato] = useState(null); // { ok: bool, texto: string }

  // PAINEL DA COORDENAÇÃO: ver/filtrar/remover relatos
  const [relatos, setRelatos] = useState([]);
  const [carregandoRelatos, setCarregandoRelatos] = useState(false);
  const [filtroRelatoDia, setFiltroRelatoDia] = useState('');
  const [filtroRelatoTipo, setFiltroRelatoTipo] = useState('');
  const [modoRemocaoRelatos, setModoRemocaoRelatos] = useState(false);
  const [selecionadosRelatos, setSelecionadosRelatos] = useState([]);
  const [confirmandoRemocaoRelatos, setConfirmandoRemocaoRelatos] = useState(false);
  const [carregandoRemocaoRelatos, setCarregandoRemocaoRelatos] = useState(false);
  const confirmarRemocaoRelatosTimeoutRef = useRef(null);

  // EDIÇÃO DE USUÁRIO EXISTENTE (coordenação)
  const [loginEmEdicao, setLoginEmEdicao] = useState('');
  const [edicaoNome, setEdicaoNome] = useState('');
  const [edicaoSenha, setEdicaoSenha] = useState('');
  const [edicaoPapel, setEdicaoPapel] = useState('aplicador');
  const [carregandoEdicao, setCarregandoEdicao] = useState(false);

  const isCoordenacao = usuarioPapel === 'coordenacao';

  const handleLogin = async (e) => {
    e.preventDefault();
    setErro('');
    setCarregando(true);

    try {
      const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: loginInput.trim(), senha: senhaInput.trim() })
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

  const carregarDashboard = async () => {
    setCarregandoDashboard(true);
    try {
      const response = await fetch(`${API_URL}/dashboard`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.status === 401) {
        handleLogout();
        return;
      }

      const data = await response.json();
      setDashboardStats(data.estatisticas);
    } catch (err) {
      console.error("Erro ao buscar dashboard:", err);
    } finally {
      setCarregandoDashboard(false);
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
    setConfirmandoRemocaoLote(false); // mudou a seleção, exige confirmar de novo
    setSelecionadosRemocao(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // GRUPO 2: botão "selecionar tudo" / "desmarcar tudo" na Fila de Aprovação
  const handleToggleSelecionarTodos = () => {
    setConfirmandoRemocaoLote(false);
    setSelecionadosRemocao(prev =>
      prev.length === pendenciasParaAprovacao.length ? [] : pendenciasParaAprovacao.map(p => p.id)
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
      setConfirmandoRemocaoLote(false);
    }
  };

  // GRUPO 2: confirmação dupla — 1º clique arma o botão (com aviso e timeout de
  // 4s pra desarmar sozinho), 2º clique dentro da janela realmente remove
  const handleClickConfirmarRemocao = () => {
    if (!confirmandoRemocaoLote) {
      setConfirmandoRemocaoLote(true);
      if (confirmarRemocaoTimeoutRef.current) clearTimeout(confirmarRemocaoTimeoutRef.current);
      confirmarRemocaoTimeoutRef.current = setTimeout(() => setConfirmandoRemocaoLote(false), 4000);
      return;
    }
    if (confirmarRemocaoTimeoutRef.current) clearTimeout(confirmarRemocaoTimeoutRef.current);
    handleConfirmarRemocao();
  };

  // ==========================================
  // GESTÃO DE USUÁRIOS/LOGINS
  // ==========================================
  const carregarUsuarios = async () => {
    try {
      const response = await fetch(`${API_URL}/usuarios`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) return;
      const data = await response.json();
      setUsuarios(data);
    } catch (err) {
      console.error("Erro ao buscar usuários:", err);
    }
  };

  const handleCriarUsuario = async () => {
    if (!novoNome.trim() || !novoLogin.trim() || !novaSenha.trim()) return;
    setCarregandoUsuario(true);
    setErroUsuario('');

    try {
      const response = await fetch(`${API_URL}/usuarios`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ nome: novoNome, login: novoLogin, senha: novaSenha, papel: novoPapel })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Erro ao criar usuário');
      }

      setNovoNome('');
      setNovoLogin('');
      setNovaSenha('');
      setNovoPapel('aplicador');
      carregarUsuarios();
    } catch (err) {
      setErroUsuario(err.message);
    } finally {
      setCarregandoUsuario(false);
    }
  };

  const handleRemoverUsuario = async (loginAlvo) => {
    setRemovendoLogin(loginAlvo);
    setErroUsuario('');

    try {
      const response = await fetch(`${API_URL}/usuarios/${encodeURIComponent(loginAlvo)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Erro ao remover usuário');
      }

      carregarUsuarios();
    } catch (err) {
      setErroUsuario(err.message);
    } finally {
      setRemovendoLogin('');
    }
  };

  // ==========================================
  // RELATOS DE SESSÃO SEM ABA NO TITA
  // ==========================================
  const carregarListaAssistidos = async () => {
    try {
      const response = await fetch(`${API_URL}/pacientes`);
      if (!response.ok) return;
      const data = await response.json();
      setListaAssistidos(Object.keys(data.pacientes || {}));
    } catch (err) {
      console.error("Erro ao buscar lista de assistidos:", err);
    }
  };

  const escolherAssistidoRelato = (nome) => {
    setRelatoAssistidoEscolhido(nome);
    setRelatoBuscaAssistido(nome);
    setRelatoDropdownAberto(false);
    setRelatoModoManual(false);
  };

  const ativarModoManualRelato = () => {
    setRelatoModoManual(true);
    setRelatoDropdownAberto(false);
    setRelatoAssistidoEscolhido('');
  };

  const voltarParaListaRelato = () => {
    setRelatoModoManual(false);
    setRelatoAssistidoManual('');
    setRelatoBuscaAssistido('');
    setRelatoAssistidoEscolhido('');
  };

  const limparFormularioRelato = () => {
    setRelatoBuscaAssistido('');
    setRelatoAssistidoEscolhido('');
    setRelatoModoManual(false);
    setRelatoAssistidoManual('');
    setRelatoDiaSemana('');
    setRelatoHorarios([]);
    setRelatoTipo('');
    setRelatoObservacao('');
  };

  // item 2 das novas sugestões: horário agora é multi-seleção
  const toggleRelatoHorario = (h) => {
    setRelatoHorarios(prev => prev.includes(h) ? prev.filter(x => x !== h) : [...prev, h]);
  };

  const handleEnviarRelato = async () => {
    const assistidoFinal = relatoModoManual ? relatoAssistidoManual.trim() : relatoAssistidoEscolhido;
    if (!assistidoFinal || !relatoDiaSemana || relatoHorarios.length === 0 || !relatoTipo) return;

    setEnviandoRelato(true);
    setMensagemRelato(null);

    // Um relato por horário marcado (ex: assistido perdeu duas abas no mesmo dia)
    let sucesso = 0;
    const erros = [];

    for (const horario of relatoHorarios) {
      try {
        const response = await fetch(`${API_URL}/relatos-aba`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            assistido: assistidoFinal,
            dia_semana: relatoDiaSemana,
            horario,
            tipo: relatoTipo,
            observacao: relatoObservacao.trim() || null,
          })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Erro ao enviar relato');
        sucesso++;
      } catch (err) {
        erros.push(`${horario}: ${err.message}`);
      }
    }

    if (sucesso > 0 && erros.length === 0) {
      setMensagemRelato({
        ok: true,
        texto: `✅ Relato${sucesso > 1 ? 's' : ''} de "${assistidoFinal}" enviado${sucesso > 1 ? 's' : ''} (${sucesso} horário${sucesso > 1 ? 's' : ''})!`
      });
      limparFormularioRelato();
    } else if (sucesso > 0) {
      setMensagemRelato({ ok: false, texto: `⚠️ ${sucesso} enviado(s), mas falhou em: ${erros.join('; ')}` });
    } else {
      setMensagemRelato({ ok: false, texto: erros.join('; ') || 'Erro ao enviar relato' });
    }

    if (isCoordenacao) carregarRelatos();
    setEnviandoRelato(false);
  };

  const carregarRelatos = async () => {
    setCarregandoRelatos(true);
    try {
      const parametros = new URLSearchParams();
      if (filtroRelatoDia) parametros.set('dia_semana', filtroRelatoDia);
      if (filtroRelatoTipo) parametros.set('tipo', filtroRelatoTipo);

      const response = await fetch(`${API_URL}/relatos-aba?${parametros.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) return;
      const data = await response.json();
      setRelatos(data);
    } catch (err) {
      console.error("Erro ao buscar relatos:", err);
    } finally {
      setCarregandoRelatos(false);
    }
  };

  const handleToggleModoRemocaoRelatos = () => {
    setModoRemocaoRelatos(prev => !prev);
    setSelecionadosRelatos([]);
    setConfirmandoRemocaoRelatos(false);
  };

  const toggleSelecaoRelato = (id) => {
    setConfirmandoRemocaoRelatos(false);
    setSelecionadosRelatos(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleToggleSelecionarTodosRelatos = () => {
    setConfirmandoRemocaoRelatos(false);
    setSelecionadosRelatos(prev =>
      prev.length === relatos.length ? [] : relatos.map(r => r.id)
    );
  };

  const handleConfirmarRemocaoRelatos = async () => {
    if (selecionadosRelatos.length === 0) return;
    setCarregandoRemocaoRelatos(true);

    try {
      const response = await fetch(`${API_URL}/relatos-aba/lote`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ids: selecionadosRelatos })
      });

      if (response.ok) {
        setSelecionadosRelatos([]);
        setModoRemocaoRelatos(false);
        carregarRelatos();
      }
    } catch (err) {
      console.error("Erro ao remover relatos em lote:", err);
    } finally {
      setCarregandoRemocaoRelatos(false);
      setConfirmandoRemocaoRelatos(false);
    }
  };

  // Mesmo padrão de confirmação dupla usado na remoção em lote de pendências
  const handleClickConfirmarRemocaoRelatos = () => {
    if (!confirmandoRemocaoRelatos) {
      setConfirmandoRemocaoRelatos(true);
      if (confirmarRemocaoRelatosTimeoutRef.current) clearTimeout(confirmarRemocaoRelatosTimeoutRef.current);
      confirmarRemocaoRelatosTimeoutRef.current = setTimeout(() => setConfirmandoRemocaoRelatos(false), 4000);
      return;
    }
    if (confirmarRemocaoRelatosTimeoutRef.current) clearTimeout(confirmarRemocaoRelatosTimeoutRef.current);
    handleConfirmarRemocaoRelatos();
  };

  useEffect(() => {
    if (token) {
      carregarPendencias();
      carregarListaAssistidos();
    }
  }, [token]);

  useEffect(() => {
    if (token && isCoordenacao) {
      carregarUsuarios();
    }
  }, [token, isCoordenacao]);

  useEffect(() => {
    if (token && tela === 'home') {
      carregarDashboard();
    }
  }, [token, tela]);

  useEffect(() => {
    if (token && isCoordenacao && tela === 'relatos-aba') {
      carregarRelatos();
    }
  }, [token, isCoordenacao, tela, filtroRelatoDia, filtroRelatoTipo]);

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

  // GRUPO 2: abrir/fechar todos os dropdowns de aplicador de uma vez
  const nomesAplicadores = Object.keys(pendenciasAgrupadas);
  const algumGrupoFechado = nomesAplicadores.some(ap => !grupoEstaAberto(ap));

  const toggleTodosGrupos = () => {
    const abrirTodos = algumGrupoFechado; // se tem algum fechado, essa ação abre todos; senão fecha todos
    const atualizado = {};
    nomesAplicadores.forEach(ap => { atualizado[ap] = abrirTodos; });
    setGruposAbertos(atualizado);
  };

  // GRUPO 2: busca por aplicador (ignora acento e maiúscula/minúscula)
  const normalizarTexto = (str) =>
    str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  const aplicadoresFiltrados = nomesAplicadores.filter(ap =>
    normalizarTexto(ap).includes(normalizarTexto(buscaAplicador))
  );

  // RELATOS: busca de assistido dentro da lista já cadastrada no sistema
  const assistidosFiltrados = relatoBuscaAssistido.trim()
    ? listaAssistidos.filter(nome => normalizarTexto(nome).includes(normalizarTexto(relatoBuscaAssistido))).slice(0, 8)
    : listaAssistidos.slice(0, 8);

  const LABEL_TIPO_RELATO = {
    sem_aba: 'Está sem ABA no TITA',
    perdeu_sessao: 'Não possui mais essa sessão',
  };

  const capitalizar = (str) => str.charAt(0).toUpperCase() + str.slice(1);

  const textoDiasPendente = (dias) => {
    if (dias <= 0) return 'pendente hoje';
    if (dias === 1) return 'pendente há 1 dia';
    return `pendente há ${dias} dias`;
  };

  // PONTO 4: data por extenso, ex: "11 de Setembro de 2026"
  const MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  const formatarDataPorExtenso = (dataIso) => {
    const [ano, mes, dia] = dataIso.split('-').map(Number);
    const nomeMes = MESES_PT[mes - 1];
    const nomeMesCapitalizado = nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1);
    return `${dia} de ${nomeMesCapitalizado} de ${ano}`;
  };

  const pendenciasParaAprovacao = pendencias.filter(p => p.feito);

  // Extrai o login do próprio usuário a partir do JWT (campo "sub"),
  // sem precisar de mais uma chamada ao backend
  const obterLoginAtual = () => {
    if (!token) return '';
    try {
      const payloadBase64 = token.split('.')[1];
      const payloadJson = JSON.parse(atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/')));
      return payloadJson.sub || '';
    } catch {
      return '';
    }
  };

  const loginAtual = obterLoginAtual();

  // ==========================================
  // TELA DE LOGIN
  // ==========================================
  if (acordandoServidor) {
    return <TelaLoading onPronto={() => setAcordandoServidor(false)} />;
  }

  if (!token) {
    return (
      <div style={{ width: '100%', maxWidth: '400px', margin: '40px auto', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 20px', boxSizing: 'border-box' }}>
        <div style={{ marginBottom: 16 }}>
          <Capybara pose="andando" />
        </div>
        <h2 className="mc-title" style={{ fontSize: 20, marginBottom: 20, textAlign: 'center', lineHeight: '1.4' }}>
          VISOR <br/> <span style={{ fontSize: 14, color: 'var(--visor-texto-suave)' }}>Instituto do Autismo</span>
        </h2>
        <div style={{ width: '100%' }}>
          <MinecraftPanel title="Acesso Restrito">
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '10px' }}>
              <input type="text" placeholder="Seu login" value={loginInput} onChange={(e) => setLoginInput(e.target.value)} style={{ padding: '12px', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '12px', border: '2px solid #053762', backgroundColor: '#FFFFFF', outline: 'none', boxShadow: 'none' }} required />
              <input type="password" placeholder="Sua senha" value={senhaInput} onChange={(e) => setSenhaInput(e.target.value)} style={{ padding: '12px', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '12px', border: '2px solid #053762', backgroundColor: '#FFFFFF', outline: 'none', boxShadow: 'none' }} required />
              <MinecraftButton type="submit" onClick={() => {}}>{carregando ? 'Entrando...' : 'Entrar'}</MinecraftButton>
              {erro && <p style={{ color: '#ff5555', fontSize: '12px', textAlign: 'center', margin: 0, textShadow: '1px 1px 0 #000' }}>{erro}</p>}
            </form>
          </MinecraftPanel>
        </div>
      </div>
    );
  }

  // Mapa de "pra onde volta" — agora que a navegação principal é o menu
  // lateral, toda tela-folha volta direto pra 'home' (o dashboard).
  const TELA_PAI = {
    'titas': 'home',
    'relatar-aba': 'home',
    'cadastro-massa': 'home',
    'relatos-aba': 'home',
    'gerenciar-usuarios': 'home',
    'salas-pacientes': 'home',
    'salas-configuracoes': 'home',
    'gerar-escala': 'home',
  };

  const irPara = (novaTela) => {
    setTela(novaTela);
    setMenuAberto(false);
  };

  // Estrutura do menu lateral. Pro aplicador é só uma lista solta (poucos
  // itens); pra coordenação vira 2 seções que expandem/recolhem (Pendências
  // e Configurações), igual ao padrão que o Ken trouxe de referência.
  const menuSecoesCoordenacao = [
    {
      chave: 'pendencias',
      titulo: 'Pendências',
      itens: [
        { label: 'Lista de Titas', onClick: () => irPara('titas') },
        { label: 'Relatar Sessão sem ABA', onClick: () => irPara('relatar-aba') },
        { label: 'Cadastro em Massa', onClick: () => irPara('cadastro-massa') },
        { label: 'Relatório de ABA no TiTa', onClick: () => irPara('relatos-aba') },
      ],
    },
    {
      chave: 'configuracoes',
      titulo: 'Configurações',
      itens: [
        { label: 'Gerenciar Aplicadores', onClick: () => irPara('gerenciar-usuarios') },
        { label: 'Gerenciar Assistidos', onClick: () => irPara('salas-pacientes') },
        { label: 'Configurações Gerais', onClick: () => irPara('salas-configuracoes') },
      ],
    },
  ];

  const menuItensSoltosCoordenacao = [
    { label: 'Gerar Escala', onClick: () => irPara('gerar-escala') },
  ];

  const menuItensAplicador = [
    { label: 'Lista de Titas', onClick: () => irPara('titas') },
    { label: 'Relatar Sessão sem ABA', onClick: () => irPara('relatar-aba') },
  ];


  // ==========================================
  // TELA PRINCIPAL DE PENDÊNCIAS
  // ==========================================
  const cardsDashboard = isCoordenacao
    ? [
        { label: 'Titas pendentes registrados', valor: dashboardStats?.pendentes },
        { label: 'Titas marcados como concluídos', valor: dashboardStats?.concluidos },
        { label: 'Ajustes de sessões de aba no TiTa', valor: dashboardStats?.ajustes_aba },
      ]
    : [
        { label: 'Suas pendências em aberto', valor: dashboardStats?.pendentes },
        { label: 'Concluídas por você', valor: dashboardStats?.concluidos },
      ];

  return (
    <>
      {/* ========================================== */}
      {/* BARRA SUPERIOR FIXA — azul, com o ☰ na esquerda (estilo TiTa) */}
      {/* ========================================== */}
      <div className="visor-topbar">
        <button className="visor-topbar-hamburger" onClick={() => setMenuAberto(true)} aria-label="Abrir menu de navegação">
          ☰
        </button>
      </div>

      {/* ========================================== */}
      {/* MENU LATERAL (drawer) — toda a navegação vive aqui agora */}
      {/* ========================================== */}
      {menuAberto && (
        <div
          onClick={() => setMenuAberto(false)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="visor-drawer"
            style={{ position: 'fixed', top: 0, left: 0, bottom: 0, width: '80%', maxWidth: '320px', overflowY: 'auto' }}
          >
            <div style={{ marginBottom: '8px' }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{usuarioNome}</h2>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px', opacity: 0.85 }}>
                {isCoordenacao ? 'Coordenação' : 'Aplicador'}
              </p>
            </div>
            <hr className="visor-drawer-divider" />

            <button className="visor-drawer-item" onClick={() => irPara('home')}>
              🏠 Início
            </button>
            <hr className="visor-drawer-divider" />

            {isCoordenacao ? (
              <>
                {menuSecoesCoordenacao.map((secao) => (
                  <div key={secao.chave} style={{ width: '100%' }}>
                    <button
                      className="visor-drawer-section-title"
                      onClick={() => setMenuSecoesAbertas((prev) => ({ ...prev, [secao.chave]: !prev[secao.chave] }))}
                    >
                      {secao.titulo}
                      <span>{menuSecoesAbertas[secao.chave] ? '▲' : '▼'}</span>
                    </button>
                    {menuSecoesAbertas[secao.chave] && (
                      <div style={{ display: 'flex', flexDirection: 'column', paddingLeft: '14px' }}>
                        {secao.itens.map((item) => (
                          <button key={item.label} className="visor-drawer-item" onClick={item.onClick}>
                            {item.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <hr className="visor-drawer-divider" />
                {menuItensSoltosCoordenacao.map((item) => (
                  <button key={item.label} className="visor-drawer-item" onClick={item.onClick}>
                    {item.label}
                  </button>
                ))}
              </>
            ) : (
              menuItensAplicador.map((item) => (
                <button key={item.label} className="visor-drawer-item" onClick={item.onClick}>
                  {item.label}
                </button>
              ))
            )}

            <hr className="visor-drawer-divider" style={{ marginTop: 'auto' }} />
            <p style={{ margin: '0 0 4px 6px', fontSize: '13px', fontWeight: 700, opacity: 0.85 }}>Acesso</p>
            <button className="visor-drawer-item" onClick={handleLogout}>
              🚪 Sair
            </button>
          </div>
        </div>
      )}

      <div style={{ width: '100%', maxWidth: '600px', minHeight: '100vh', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 16px', paddingTop: 'calc(56px + env(safe-area-inset-top, 0px) + 20px)', boxSizing: 'border-box' }}>

      <div style={{ width: '100%', marginBottom: '24px', textAlign: 'left' }}>
        <h2 className="mc-title" style={{ fontSize: 16, margin: 0, lineHeight: '1.3' }}>Olá, {usuarioNome}</h2>
        <p style={{ color: 'var(--visor-texto-suave)', fontSize: '12px', margin: '4px 0 0 0' }}>
          {isCoordenacao ? 'Visão Geral (Coordenação)' : 'Suas pendências'}
        </p>
      </div>

      {/* ========================================== */}
      {/* DASHBOARD (home) — números de resumo, a navegação agora é só o menu lateral */}
      {/* ========================================== */}
      {tela === 'home' && (
        <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {carregandoDashboard && !dashboardStats && (
            <p style={{ color: '#F0F8FF', fontSize: '12px', textAlign: 'center' }}>Carregando...</p>
          )}
          {cardsDashboard.map((card) => (
            <MinecraftPanel key={card.label}>
              <p style={{ margin: 0, fontSize: '11px', color: '#F0F8FF' }}>{card.label}</p>
              <p style={{ margin: '4px 0 0 0', fontSize: '28px', fontWeight: 'bold' }}>
                {card.valor ?? '—'}
              </p>
            </MinecraftPanel>
          ))}
        </div>
      )}

      {/* Botão de voltar das telas finais (Lista de Titas, Cadastro em Massa,
          etc.) — as telas de Salas já têm o próprio botão embutido, então
          ficam de fora daqui */}
      {tela !== 'home' && !['gerar-escala', 'salas-pacientes', 'salas-configuracoes'].includes(tela) && (
        <MinecraftButton onClick={() => setTela(TELA_PAI[tela] || 'home')} style={{ fontSize: '10px', padding: '10px 14px', marginBottom: '16px', alignSelf: 'flex-start' }}>
          ← Voltar
        </MinecraftButton>
      )}

      {/* ========================================== */}
      {/* DIRECIONAMENTO DE SALAS — agora dentro do mesmo login, exclusivo coordenação */}
      {/* ========================================== */}
      {isCoordenacao && tela === 'gerar-escala' && <TelaGerarEscala onVoltar={() => setTela(TELA_PAI['gerar-escala'])} />}
      {isCoordenacao && tela === 'salas-pacientes' && <TelaPacientes onVoltar={() => setTela(TELA_PAI['salas-pacientes'])} />}
      {isCoordenacao && tela === 'salas-configuracoes' && <TelaConfiguracoes onVoltar={() => setTela(TELA_PAI['salas-configuracoes'])} />}

      {/* ========================================== */}
      {/* RELATAR SESSÃO SEM ABA NO TITA (aplicador + coordenação) */}
      {/* ========================================== */}
      {tela === 'relatar-aba' && (
        <MinecraftPanel title="Relatar Sessão sem ABA">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
            <p style={{ fontSize: '14px', color: '#333', lineHeight: '1.6', margin: 0 }}>
              Use quando um assistido tem/tinha sessão de ABA marcada na agenda, mas ela não existe no Titas.
            </p>

            {!relatoModoManual ? (
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="Buscar assistido..."
                    value={relatoBuscaAssistido}
                    onChange={(e) => { setRelatoBuscaAssistido(e.target.value); setRelatoAssistidoEscolhido(''); setRelatoDropdownAberto(true); }}
                    onFocus={() => setRelatoDropdownAberto(true)}
                    onBlur={() => setTimeout(() => setRelatoDropdownAberto(false), 150)}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '10px', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '10px', border: '2px solid #053762', backgroundColor: '#FFFFFF', outline: 'none', boxShadow: 'none' }}
                  />
                  {relatoDropdownAberto && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, backgroundColor: '#fff', border: '2px solid #555', maxHeight: '200px', overflowY: 'auto', boxShadow: '2px 2px 0 rgba(0,0,0,0.3)' }}>
                      {assistidosFiltrados.length === 0 && (
                        <div style={{ padding: '8px 10px', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '9px', color: '#777' }}>Nenhum assistido encontrado</div>
                      )}
                      {assistidosFiltrados.map((nome) => (
                        <div
                          key={nome}
                          onMouseDown={() => escolherAssistidoRelato(nome)}
                          style={{ padding: '8px 10px', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '9px', cursor: 'pointer', borderBottom: '1px solid #ccc' }}
                        >
                          {nome}
                        </div>
                      ))}
                      <div
                        onMouseDown={ativarModoManualRelato}
                        style={{ padding: '8px 10px', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '9px', cursor: 'pointer', color: '#053762' }}
                      >
                        ➕ Outro (nome não está na lista)
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <input
                    type="text"
                    placeholder="Nome completo do assistido"
                    value={relatoAssistidoManual}
                    onChange={(e) => setRelatoAssistidoManual(e.target.value)}
                    style={{ padding: '10px', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '10px', border: '2px solid #053762', backgroundColor: '#FFFFFF', outline: 'none', boxShadow: 'none' }}
                  />
                  <span onClick={voltarParaListaRelato} style={{ fontSize: '9px', color: '#053762', cursor: 'pointer', textDecoration: 'underline', alignSelf: 'flex-start' }}>← voltar pra lista</span>
                </div>
              )}

              <select value={relatoDiaSemana} onChange={(e) => setRelatoDiaSemana(e.target.value)} style={{ padding: '10px', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '10px', border: '2px solid #053762', backgroundColor: '#FFFFFF', outline: 'none' }}>
                <option value="">Dia da semana...</option>
                {DIAS_SEMANA_RELATO.map(d => <option key={d} value={d}>{capitalizar(d)}</option>)}
              </select>

              <div>
                <p style={{ fontSize: '10px', color: '#333', margin: '0 0 6px 0', fontFamily: 'Arial, Helvetica, sans-serif' }}>
                  Horário(s) — marque quantos precisar:
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {HORARIOS_RELATO.map(h => (
                    <label
                      key={h}
                      style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 10px', border: '2px solid #555', backgroundColor: relatoHorarios.includes(h) ? '#a8e6cf' : '#d9d9d9', cursor: 'pointer', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '9px' }}
                    >
                      <input
                        type="checkbox"
                        checked={relatoHorarios.includes(h)}
                        onChange={() => toggleRelatoHorario(h)}
                        style={{ width: '14px', height: '14px' }}
                      />
                      {h}
                    </label>
                  ))}
                </div>
              </div>

              <select value={relatoTipo} onChange={(e) => setRelatoTipo(e.target.value)} style={{ padding: '10px', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '10px', border: '2px solid #053762', backgroundColor: '#FFFFFF', outline: 'none' }}>
                <option value="">O que aconteceu?</option>
                <option value="sem_aba">Está sem ABA no TITA</option>
                <option value="perdeu_sessao">Não possui mais essa sessão</option>
              </select>

              <textarea
                value={relatoObservacao}
                onChange={(e) => setRelatoObservacao(e.target.value)}
                placeholder="Observação (opcional)"
                rows={2}
                style={{ padding: '10px', fontFamily: 'monospace', fontSize: '12px', border: '2px solid #053762', backgroundColor: '#FFFFFF', outline: 'none', boxShadow: 'none', resize: 'vertical' }}
              />

              <MinecraftButton
                onClick={handleEnviarRelato}
                disabled={
                  enviandoRelato ||
                  (!relatoModoManual && !relatoAssistidoEscolhido) ||
                  (relatoModoManual && !relatoAssistidoManual.trim()) ||
                  !relatoDiaSemana || relatoHorarios.length === 0 || !relatoTipo
                }
              >
                {enviandoRelato ? 'Enviando...' : 'Enviar Relato'}
              </MinecraftButton>

              {mensagemRelato && (
                <p style={{ color: mensagemRelato.ok ? '#1d5930' : '#a83232', fontSize: '11px', textAlign: 'center', margin: 0, fontFamily: 'Arial, Helvetica, sans-serif' }}>
                  {mensagemRelato.texto}
                </p>
              )}
            </div>
        </MinecraftPanel>
      )}

      {/* ========================================== */}
      {/* PONTO 1: CADASTRO EM MASSA (só coordenação) */}
      {/* ========================================== */}
      {isCoordenacao && tela === 'cadastro-massa' && (
        <MinecraftPanel title="Cadastro em Massa">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
              <p style={{ fontSize: '12px', color: '#333', lineHeight: '1.6', margin: 0 }}>
                  Uma linha por tita, campos separados por ";":<br/>
                  <strong>DATA;HORARIO;TITA;APLICADOR;OBSERVACAO</strong><br/>
                  (DATA no formato DD/MM/AAAA · OBSERVACAO é opcional)
                </p>
                <textarea
                  value={textoBulk}
                  onChange={(e) => setTextoBulk(e.target.value)}
                  placeholder={"08/09/2026;09:00;LUCAS EDUARDO;ALICIA VITÓRIA;\n09/09/2026;14:30;GABRIEL NOVAES;VINICIUS GOMES;"}
                  rows={5}
                  style={{ padding: '10px', fontFamily: 'monospace', fontSize: '12px', border: '2px solid #053762', backgroundColor: '#FFFFFF', outline: 'none', boxShadow: 'none', resize: 'vertical' }}
                />
                <MinecraftButton onClick={handleEnviarBulk} disabled={carregandoBulk || !textoBulk.trim()}>
                  {carregandoBulk ? 'Enviando...' : 'Cadastrar Titas'}
                </MinecraftButton>

                {resultadoBulk && (
                  <div style={{ fontSize: '10px', fontFamily: 'Arial, Helvetica, sans-serif', lineHeight: '1.8' }}>
                    <p style={{ color: '#1d5930', margin: '4px 0' }}>✅ {resultadoBulk.inseridos} tita(s) cadastrado(s)</p>
                    {resultadoBulk.erros.length > 0 && (
                      <div style={{ color: '#a83232' }}>
                        <p style={{ margin: '8px 0 4px 0' }}>❌ {resultadoBulk.erros.length} não cadastrado(s):</p>
                        {resultadoBulk.erros.map((e, i) => (
                          <p key={i} style={{ margin: '2px 0 10px 0', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '8px', lineHeight: '1.7', backgroundColor: '#fdeaea', padding: '8px', border: '1px solid #e0b4b4', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{e}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
        </MinecraftPanel>
      )}

      {/* ================================================= */}
      {/* PONTO 2: FILA DE APROVAÇÃO DE REMOÇÃO (coordenação, dentro da tela Lista de Titas) */}
      {/* ================================================= */}
      {tela === 'titas' && isCoordenacao && pendenciasParaAprovacao.length > 0 && (
        <div style={{ width: '100%', marginTop: '20px' }}>
          <MinecraftPanel title="Fila de Aprovação">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
              <p style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '10px', color: '#111', textShadow: '1px 1px 0px #fff', margin: 0 }}>
                {pendenciasParaAprovacao.length} tita(s) aguardando remoção
              </p>
              <MinecraftButton onClick={handleToggleSelecionarTodos} style={{ fontSize: '9px', padding: '8px 10px', alignSelf: 'flex-start' }}>
                {selecionadosRemocao.length === pendenciasParaAprovacao.length ? 'Desmarcar todos' : 'Selecionar todos'}
              </MinecraftButton>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {pendenciasParaAprovacao.map((p) => (
                  <label
                    key={p.id}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', backgroundColor: '#a8e6cf', border: '2px solid #3b7d4f', cursor: 'pointer', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '10px', color: '#000' }}
                  >
                    <input
                      type="checkbox"
                      checked={selecionadosRemocao.includes(p.id)}
                      onChange={() => toggleSelecaoRemocao(p.id)}
                      style={{ width: '16px', height: '16px', flexShrink: 0 }}
                    />
                    <span>{p.tita} <span style={{ color: '#333' }}>({p.aplicador} · {formatarDataPorExtenso(p.data)})</span></span>
                  </label>
                ))}
              </div>
              <MinecraftButton
                onClick={handleClickConfirmarRemocao}
                disabled={carregandoRemocao || selecionadosRemocao.length === 0}
                style={confirmandoRemocaoLote ? { backgroundColor: '#a83232', color: '#fff' } : undefined}
              >
                {carregandoRemocao
                  ? 'Removendo...'
                  : confirmandoRemocaoLote
                    ? `Tem certeza? Clique de novo (${selecionadosRemocao.length})`
                    : `Confirmar remoção (${selecionadosRemocao.length})`}
              </MinecraftButton>
            </div>
          </MinecraftPanel>
        </div>
      )}

      {/* ================================================= */}
      {/* RELATOS DE SESSÃO SEM ABA — VISÃO DA COORDENAÇÃO */}
      {/* ================================================= */}
      {isCoordenacao && tela === 'relatos-aba' && (
        <div style={{ width: '100%' }}>
          <MinecraftPanel title="Relatório de ABA no TiTa">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>

                {/* Filtros */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <select value={filtroRelatoDia} onChange={(e) => setFiltroRelatoDia(e.target.value)} style={{ flex: 1, minWidth: '120px', padding: '10px', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '9px', border: '2px solid #053762', backgroundColor: '#FFFFFF', outline: 'none' }}>
                    <option value="">Todos os dias</option>
                    {DIAS_SEMANA_RELATO.map(d => <option key={d} value={d}>{capitalizar(d)}</option>)}
                  </select>
                  <select value={filtroRelatoTipo} onChange={(e) => setFiltroRelatoTipo(e.target.value)} style={{ flex: 1, minWidth: '120px', padding: '10px', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '9px', border: '2px solid #053762', backgroundColor: '#FFFFFF', outline: 'none' }}>
                    <option value="">Todos os tipos</option>
                    <option value="sem_aba">Está sem ABA no TITA</option>
                    <option value="perdeu_sessao">Não possui mais essa sessão</option>
                  </select>
                </div>

                {carregandoRelatos && (
                  <p style={{ textAlign: 'center', fontSize: '10px', color: '#555', margin: 0 }}>Carregando...</p>
                )}

                {!carregandoRelatos && relatos.length === 0 && (
                  <p style={{ textAlign: 'center', fontSize: '11px', color: '#555', margin: '10px 0', fontFamily: 'Arial, Helvetica, sans-serif' }}>
                    Nenhum relato encontrado 🎉
                  </p>
                )}

                {!carregandoRelatos && relatos.length > 0 && (
                  <>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <MinecraftButton onClick={handleToggleModoRemocaoRelatos} style={{ fontSize: '9px', padding: '8px 10px' }}>
                        {modoRemocaoRelatos ? 'Cancelar remoção' : 'Modo de remoção'}
                      </MinecraftButton>
                      {modoRemocaoRelatos && (
                        <MinecraftButton onClick={handleToggleSelecionarTodosRelatos} style={{ fontSize: '9px', padding: '8px 10px' }}>
                          {selecionadosRelatos.length === relatos.length ? 'Desmarcar todos' : 'Selecionar todos'}
                        </MinecraftButton>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {relatos.map((r) => (
                        <label
                          key={r.id}
                          style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', backgroundColor: r.tipo === 'sem_aba' ? '#ffd8a8' : '#ffc9c9', border: '2px solid #555', cursor: modoRemocaoRelatos ? 'pointer' : 'default', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '9px', color: '#000' }}
                        >
                          {modoRemocaoRelatos && (
                            <input
                              type="checkbox"
                              checked={selecionadosRelatos.includes(r.id)}
                              onChange={() => toggleSelecaoRelato(r.id)}
                              style={{ width: '16px', height: '16px', flexShrink: 0 }}
                            />
                          )}
                          <span style={{ lineHeight: '1.6' }}>
                            {r.assistido} <span style={{ color: '#333' }}>— {capitalizar(r.dia_semana)}, {r.horario}</span><br />
                            <span style={{ color: '#053762' }}>{LABEL_TIPO_RELATO[r.tipo] || r.tipo}</span> · <span style={{ color: '#555' }}>relatado por {r.aplicador}</span>
                            {r.observacao && <><br /><span style={{ color: '#555' }}>Obs: {r.observacao}</span></>}
                          </span>
                        </label>
                      ))}
                    </div>

                    {modoRemocaoRelatos && (
                      <MinecraftButton
                        onClick={handleClickConfirmarRemocaoRelatos}
                        disabled={carregandoRemocaoRelatos || selecionadosRelatos.length === 0}
                        style={confirmandoRemocaoRelatos ? { backgroundColor: '#a83232', color: '#fff' } : undefined}
                      >
                        {carregandoRemocaoRelatos
                          ? 'Removendo...'
                          : confirmandoRemocaoRelatos
                            ? `Tem certeza? Clique de novo (${selecionadosRelatos.length})`
                            : `Remover selecionados (${selecionadosRelatos.length})`}
                      </MinecraftButton>
                    )}
                  </>
                )}
              </div>
          </MinecraftPanel>
        </div>
      )}

      {/* ================================================= */}
      {/* GRUPO 3: GESTÃO DE USUÁRIOS/LOGINS — agora é uma tela do menu (item 6) */}
      {/* ================================================= */}
      {isCoordenacao && tela === 'gerenciar-usuarios' && (
        <div style={{ width: '100%' }}>
          <MinecraftPanel title="Gerenciar Aplicadores">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '4px' }}>
                <p style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '10px', color: '#111', textShadow: '1px 1px 0px #fff', margin: 0 }}>
                  {usuarios.length} usuário(s) cadastrado(s)
                </p>

                {/* Formulário de criação */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <p style={{ fontSize: '10px', color: '#111', margin: 0, fontFamily: 'Arial, Helvetica, sans-serif' }}>Novo aplicador/coordenação</p>
                  <input type="text" placeholder="Nome completo" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} style={{ padding: '10px', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '10px', border: '2px solid #053762', backgroundColor: '#FFFFFF', outline: 'none', boxShadow: 'none' }} />
                  <input type="text" placeholder="Login" value={novoLogin} onChange={(e) => setNovoLogin(e.target.value)} style={{ padding: '10px', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '10px', border: '2px solid #053762', backgroundColor: '#FFFFFF', outline: 'none', boxShadow: 'none' }} />
                  <input type="password" placeholder="Senha inicial" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} style={{ padding: '10px', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '10px', border: '2px solid #053762', backgroundColor: '#FFFFFF', outline: 'none', boxShadow: 'none' }} />
                  <select value={novoPapel} onChange={(e) => setNovoPapel(e.target.value)} style={{ padding: '10px', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '10px', border: '2px solid #053762', backgroundColor: '#FFFFFF', outline: 'none' }}>
                    <option value="aplicador">Aplicador</option>
                    <option value="coordenacao">Coordenação</option>
                  </select>
                  <MinecraftButton onClick={handleCriarUsuario} disabled={carregandoUsuario || !novoNome.trim() || !novoLogin.trim() || !novaSenha.trim()}>
                    {carregandoUsuario ? 'Criando...' : 'Criar Usuário'}
                  </MinecraftButton>
                  {erroUsuario && <p style={{ color: '#ff5555', fontSize: '11px', textAlign: 'center', margin: 0 }}>{erroUsuario}</p>}
                </div>

                {/* Lista de usuários existentes */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '2px solid #555', paddingTop: '14px' }}>
                  {usuarios.map((u) => (
                    <div
                      key={u.login}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', backgroundColor: '#C6C6C6', border: '2px solid', borderColor: '#fff #555 #555 #fff', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '10px' }}
                    >
                      <div>
                        <div style={{ color: '#000' }}>{u.nome} {u.login === loginAtual && '(você)'}</div>
                        <div style={{ color: '#555', fontSize: '9px', marginTop: '4px' }}>{u.login} · {u.papel}</div>
                      </div>
                      <MinecraftButton
                        onClick={() => handleRemoverUsuario(u.login)}
                        disabled={u.login === loginAtual || removendoLogin === u.login}
                        style={{ fontSize: '9px', padding: '8px 10px' }}
                      >
                        {removendoLogin === u.login ? '...' : 'Remover'}
                      </MinecraftButton>
                    </div>
                  ))}
                </div>
              </div>
          </MinecraftPanel>
        </div>
      )}

      {/* ========================================== */}
      {/* LISTA PRINCIPAL DE PENDÊNCIAS POR APLICADOR */}
      {/* ========================================== */}
      {tela === 'titas' && (
      <div style={{ width: '100%' }}>
        <MinecraftPanel title="Lista de Titas">
          {pendencias.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#555', margin: '30px 0', fontSize: '12px', fontFamily: 'Arial, Helvetica, sans-serif', lineHeight: '1.6' }}>
              Nenhuma pendência<br/>encontrada por<br/>enquanto! 🎉
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '10px' }}>

              {/* GRUPO 2: busca + abrir/fechar todos — só coordenação (aplicador só tem um grupo, não faz sentido) */}
              {isCoordenacao && (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    placeholder="Buscar aplicador..."
                    value={buscaAplicador}
                    onChange={(e) => setBuscaAplicador(e.target.value)}
                    style={{ flex: 1, minWidth: '140px', padding: '10px', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '10px', border: '2px solid #053762', backgroundColor: '#FFFFFF', outline: 'none', boxShadow: 'none' }}
                  />
                  <MinecraftButton onClick={toggleTodosGrupos} style={{ fontSize: '9px', padding: '10px 12px', whiteSpace: 'nowrap' }}>
                    {algumGrupoFechado ? 'Abrir todos' : 'Fechar todos'}
                  </MinecraftButton>
                </div>
              )}

              {aplicadoresFiltrados.length === 0 && (
                <p style={{ textAlign: 'center', color: '#555', margin: '10px 0', fontSize: '11px', fontFamily: 'Arial, Helvetica, sans-serif' }}>
                  Nenhum aplicador encontrado
                </p>
              )}

              {/* RENDERIZAÇÃO CATEGORIZADA POR APLICADOR */}
              {aplicadoresFiltrados.map((aplicador) => {
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
                      <h3 style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '12px', color: '#053762', textShadow: '1px 1px 0px #fff', margin: 0 }}>
                        {aberto ? '▼' : '▶'} {aplicador}
                      </h3>
                      <span style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '10px', color: totalPendentes > 0 ? '#a83232' : '#1d5930', textShadow: '1px 1px 0px #fff' }}>
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
                            <div style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
                              <div style={{ fontSize: '10px', color: '#333', marginBottom: '8px' }}>{formatarDataPorExtenso(p.data)} ({p.dia_semana}) - {p.horario}</div>
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
      )}
    </div>
    </>
  );
}

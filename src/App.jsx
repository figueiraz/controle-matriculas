import { useState, useMemo, useEffect } from 'react';
import { collection, addDoc, updateDoc, doc, onSnapshot, setDoc, deleteDoc } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { db, auth } from './firebase';
import { STATUS_COLORS, ROW_COLORS } from './mockData';
import Login from './Login';

function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [students, setStudents] = useState([]);
  const [responsaveisList, setResponsaveisList] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  
  // Configurações
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [newResponsavel, setNewResponsavel] = useState('');

  // Filtros Avançados
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    turma: 'Todas',
    situacao: 'Todas',
    genero: 'Todos',
    responsavel: '',
    ordenarPor: 'nomeAsc'
  });
  
  // Estado para a linha de Novo Aluno
  const initialFormData = {
    nome: '', genero: 'MULHER', cpf: '', turma: 'Manhã', idade: '', responsavel: '', situacao: 'MATRICULADO', observacoes: ''
  };
  const [formData, setFormData] = useState(initialFormData);
  const [isAddingNew, setIsAddingNew] = useState(false);

  // Estado para edição inline
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [copiedMsg, setCopiedMsg] = useState('');

  // Estado para menu de contexto (Exclusão)
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, student: null });

  useEffect(() => {
    const handleClickOutside = () => setContextMenu({ visible: false, x: 0, y: 0, student: null });
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });

    return () => {
      unsubscribeAuth();
    };
  }, []);

  useEffect(() => {
    if (!user) return; // Só busca dados se estiver logado

    const userPresenceRef = doc(db, "online_users", user.uid);
    
    // Atualiza a presença a cada 15 segundos (heartbeat)
    const updatePresence = () => {
      setDoc(userPresenceRef, {
        email: user.email,
        timestamp: new Date().toISOString()
      });
    };
    
    updatePresence();
    const presenceInterval = setInterval(updatePresence, 15000);

    const handleBeforeUnload = () => {
      deleteDoc(userPresenceRef);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Ouvir usuários online (com filtro de inatividade)
    const unsubscribePresence = onSnapshot(collection(db, "online_users"), (snapshot) => {
      const usersData = [];
      const now = new Date().getTime();
      
      snapshot.forEach((d) => {
        const data = d.data();
        const lastSeen = new Date(data.timestamp).getTime();
        // Só considera online quem pingou nos últimos 45 segundos
        if (now - lastSeen < 45000) {
          usersData.push({ uid: d.id, ...data });
        }
      });
      setOnlineUsers(usersData);
    });

    const unsubscribeAlunos = onSnapshot(collection(db, "alunos"), (snapshot) => {
      const studentsData = [];
      snapshot.forEach((doc) => {
        studentsData.push({ id: doc.id, ...doc.data() });
      });
      setStudents(studentsData);
    });

    const unsubscribeSettings = onSnapshot(doc(db, "settings", "geral"), (docSnap) => {
      if (docSnap.exists()) {
        setResponsaveisList(docSnap.data().responsaveis || []);
      }
    });

    return () => {
      // Ao deslogar ou desmontar, remove a presença e limpa os listeners
      clearInterval(presenceInterval);
      deleteDoc(userPresenceRef);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      unsubscribePresence();
      unsubscribeAlunos();
      unsubscribeSettings();
    };
  }, [user]);


  const filteredStudents = useMemo(() => {
    let result = students.filter(student => {
      const matchesSearch = student.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            student.cpf.includes(searchTerm);
      
      const matchesTurma = filters.turma === 'Todas' || student.turma === filters.turma;
      const matchesSituacao = filters.situacao === 'Todas' || student.situacao === filters.situacao;
      const matchesGenero = filters.genero === 'Todos' || student.genero === filters.genero;
      
      const resVal = student.responsavel ? student.responsavel.toLowerCase() : '';
      const matchesResponsavel = !filters.responsavel || resVal.includes(filters.responsavel.toLowerCase());

      return matchesSearch && matchesTurma && matchesSituacao && matchesGenero && matchesResponsavel;
    });

    result.sort((a, b) => {
      if (filters.ordenarPor === 'nomeAsc') {
        return a.nome.localeCompare(b.nome);
      } 
      else if (filters.ordenarPor === 'idadeAsc' || filters.ordenarPor === 'idadeDesc') {
        const idadeA = parseInt(a.idade) || (filters.ordenarPor === 'idadeAsc' ? 999 : -1);
        const idadeB = parseInt(b.idade) || (filters.ordenarPor === 'idadeAsc' ? 999 : -1);
        
        if (filters.ordenarPor === 'idadeAsc') {
          return idadeA - idadeB;
        } else {
          return idadeB - idadeA;
        }
      }
      return 0;
    });

    return result;
  }, [students, searchTerm, filters]);

  const stats = useMemo(() => {
    return {
      total: students.length,
      manha: students.filter(s => s.turma === 'Manhã').length,
      tarde: students.filter(s => s.turma === 'Tarde').length,
      desistentes: students.filter(s => s.situacao === 'DESISTENTE').length,
      matriculados: students.filter(s => s.situacao === 'MATRICULADO').length,
      docsPendentes: students.filter(s => s.situacao === 'DOCS PENDENTES').length,
      assinarTermo: students.filter(s => s.situacao === 'ASSINAR TERMO').length,
    };
  }, [students]);

  const exportToCSV = () => {
    if (filteredStudents.length === 0) {
      alert("Nenhum aluno para exportar.");
      return;
    }

    const headers = ["Nome", "Gênero", "CPF", "Turma", "Idade", "Situação", "Responsável", "Observações"];
    
    const escapeCsv = (str) => {
      if (!str) return '""';
      const safeStr = String(str).replace(/"/g, '""');
      return `"${safeStr}"`;
    };

    const rows = filteredStudents.map(student => [
      escapeCsv(student.nome),
      escapeCsv(student.genero),
      escapeCsv(student.cpf),
      escapeCsv(student.turma),
      escapeCsv(student.idade),
      escapeCsv(student.situacao),
      escapeCsv(student.responsavel),
      escapeCsv(student.observacoes)
    ]);

    const csvContent = [
      headers.join(";"),
      ...rows.map(e => e.join(";"))
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Alunos_Exportados_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSaveNovo = async () => {
    if (!formData.nome.trim()) {
      alert("O nome do aluno é obrigatório para salvar.");
      return;
    }
    try {
      await addDoc(collection(db, "alunos"), formData);
      setFormData(initialFormData); // Reseta a linha
      setIsAddingNew(false);
    } catch (error) {
      console.error("Erro ao salvar:", error);
      alert("Houve um erro ao adicionar o aluno.");
    }
  };

  const handleNewRowKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSaveNovo();
    } else if (e.key === 'Escape') {
      setIsAddingNew(false);
      setFormData(initialFormData);
    }
  };

  const handleAddResponsavel = async (e) => {
    e.preventDefault();
    if (!newResponsavel.trim()) return;
    try {
      const newList = [...responsaveisList, newResponsavel.trim()].sort();
      await setDoc(doc(db, "settings", "geral"), { responsaveis: newList }, { merge: true });
      setNewResponsavel('');
    } catch (error) {
      console.error("Erro ao salvar responsável:", error);
    }
  };

  const handleRemoveResponsavel = async (respToRemove) => {
    try {
      const newList = responsaveisList.filter(r => r !== respToRemove);
      await setDoc(doc(db, "settings", "geral"), { responsaveis: newList }, { merge: true });
    } catch (error) {
      console.error("Erro ao remover responsável:", error);
    }
  };

  const startEditing = (student, field) => {
    setEditingCell({ id: student.id, field });
    setEditValue(student[field] || '');
  };

  const saveCell = async (studentId, field) => {
    if (editingCell) {
      try {
        const studentRef = doc(db, "alunos", studentId);
        await updateDoc(studentRef, { [field]: editValue });
      } catch (error) {
        console.error("Erro ao salvar edição:", error);
      }
    }
    setEditingCell(null);
  };

  const handleKeyDown = (e, studentId, field) => {
    if (e.key === 'Enter') saveCell(studentId, field);
    else if (e.key === 'Escape') setEditingCell(null);
  };

  const handleContextMenu = (e, student) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      student
    });
  };

  const handleDeleteStudent = async (student) => {
    if (window.confirm(`Tem certeza que deseja excluir o aluno ${student.nome || ''}? Esta ação não pode ser desfeita.`)) {
      try {
        await deleteDoc(doc(db, "alunos", student.id));
        setContextMenu({ visible: false, x: 0, y: 0, student: null });
      } catch (error) {
        console.error("Erro ao excluir aluno:", error);
        alert("Erro ao excluir aluno.");
      }
    }
  };

  const renderCell = (student, field, type = 'text', options = []) => {
    const isEditing = editingCell?.id === student.id && editingCell?.field === field;
    
    if (isEditing) {
      if (type === 'select') {
        return (
          <select
            autoFocus
            className="inline-edit-input"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => saveCell(student.id, field)}
            onKeyDown={(e) => handleKeyDown(e, student.id, field)}
          >
            {options.map(opt => <option key={opt} value={opt}>{opt || 'Selecione...'}</option>)}
          </select>
        );
      }
      return (
        <input
          autoFocus
          type="text"
          className="inline-edit-input"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => saveCell(student.id, field)}
          onKeyDown={(e) => handleKeyDown(e, student.id, field)}
        />
      );
    }

    let displayValue = student[field] || '-';
    
    const isCopyField = field === 'nome' || field === 'cpf';
    
    const handleCellClick = () => {
      if (isCopyField) {
        if (student[field]) {
          navigator.clipboard.writeText(student[field]);
          setCopiedMsg(`${field === 'nome' ? 'Nome' : 'CPF'} copiado: ${student[field]}`);
          setTimeout(() => setCopiedMsg(''), 2500);
        }
      } else {
        startEditing(student, field);
      }
    };

    const handleCellDoubleClick = () => {
      if (isCopyField) {
        startEditing(student, field);
      }
    };

    const tooltipMsg = isCopyField ? "1 Clique: Copiar | 2 Cliques: Editar" : "Clique para editar";

    if (field === 'situacao') {
      return (
        <span 
          onClick={handleCellClick}
          onDoubleClick={handleCellDoubleClick}
          className="status-badge editable-cell" 
          style={{
            backgroundColor: STATUS_COLORS[student.situacao] ? `${STATUS_COLORS[student.situacao]}20` : '#ccc',
            color: STATUS_COLORS[student.situacao] || '#333'
          }}
          title={tooltipMsg}
        >
          {displayValue}
        </span>
      );
    }

    return (
      <div 
        onClick={handleCellClick}
        onDoubleClick={handleCellDoubleClick}
        className="editable-cell"
        title={tooltipMsg}
      >
        {field === 'nome' ? <strong>{displayValue}</strong> : displayValue}
      </div>
    );
  };

  if (authLoading) {
    return <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}><h2>Carregando...</h2></div>;
  }

  if (!user) {
    return <Login />;
  }

  return (
    <div className="container">
      <header className="header">
        <div>
          <h1>Painel de Matrículas</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.2rem', fontSize: '1.1rem', letterSpacing: '0.05em' }}>Unidade POA</p>
        </div>
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          {onlineUsers.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', background: 'rgba(16, 185, 129, 0.1)', padding: '0.5rem 0.8rem', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
              {onlineUsers.map(u => (
                <div key={u.uid} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                    <span style={{ width: '8px', height: '8px', backgroundColor: '#10B981', borderRadius: '50%', boxShadow: '0 0 5px #10B981' }}></span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Online:</span>
                  </span>
                  <span style={{ fontSize: '0.85rem', color: '#10B981', fontWeight: '600' }} title={u.email}>
                    {u.email.split('@')[0]}
                  </span>
                </div>
              ))}
            </div>
          )}
          
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                Logado como: <strong style={{ color: 'var(--text-primary)' }}>{user?.email}</strong>
              </span>
              <button 
                className="btn" 
                style={{ padding: '0.4rem 1rem', backgroundColor: 'var(--danger-color)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}
                onClick={() => signOut(auth)}
                title="Sair do sistema"
              >
                <i className="fas fa-sign-out-alt"></i> Sair
              </button>
            </div>

          </div>
        </div>
      </header>

      <div className="stats-grid">
        <div className="glass-panel stat-card">
          <h3>Total de Alunos</h3>
          <span className="value">{stats.total}</span>
        </div>
        <div className="glass-panel stat-card">
          <h3>Turma Manhã</h3>
          <span className="value">{stats.manha}</span>
        </div>
        <div className="glass-panel stat-card">
          <h3>Turma Tarde</h3>
          <span className="value">{stats.tarde}</span>
        </div>
        <div className="glass-panel stat-card">
          <h3>Matriculados</h3>
          <span className="value" style={{color: 'var(--success-color)'}}>{stats.matriculados}</span>
        </div>
        <div className="glass-panel stat-card">
          <h3>Docs Pendentes</h3>
          <span className="value" style={{color: 'var(--warning-color)'}}>{stats.docsPendentes}</span>
        </div>
        <div className="glass-panel stat-card">
          <h3>Assinar Termo</h3>
          <span className="value" style={{color: 'var(--primary-color)'}}>{stats.assinarTermo}</span>
        </div>
        <div className="glass-panel stat-card">
          <h3>Desistentes</h3>
          <span className="value" style={{color: 'var(--danger-color)'}}>{stats.desistentes}</span>
        </div>
      </div>

      <div className="glass-panel">
        <div className="controls">
          <input 
            type="text" 
            className="search-input" 
            placeholder="Buscar por Nome ou CPF..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', maxWidth: '400px' }}
          />
        </div>

        <div className="filters-panel">
          <div className="filter-group">
            <label>Turma</label>
            <select className="filter-select" value={filters.turma} onChange={e => setFilters({...filters, turma: e.target.value})}>
              <option value="Todas">Todas</option>
              <option value="Manhã">Manhã</option>
              <option value="Tarde">Tarde</option>
            </select>
          </div>
          
          <div className="filter-group">
            <label>Situação</label>
            <select className="filter-select" value={filters.situacao} onChange={e => setFilters({...filters, situacao: e.target.value})}>
              <option value="Todas">Todas</option>
              <option value="MATRICULADO">MATRICULADO</option>
              <option value="DESISTENTE">DESISTENTE</option>
              <option value="ELIMINADO">ELIMINADO</option>
              <option value="REPROVADO">REPROVADO</option>
              <option value="ASSINAR TERMO">ASSINAR TERMO</option>
              <option value="DOCS PENDENTES">DOCS PENDENTES</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Gênero</label>
            <select className="filter-select" value={filters.genero} onChange={e => setFilters({...filters, genero: e.target.value})}>
              <option value="Todos">Todos</option>
              <option value="MULHER">MULHER</option>
              <option value="HOMEM">HOMEM</option>
              <option value="OUTRO">OUTRO</option>
            </select>
          </div>

          <div className="filter-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              Responsável
              <button 
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}
                title="Editar Responsáveis"
              >
                <i className="fas fa-pencil-alt"></i>
              </button>
            </label>
            <select className="filter-select" value={filters.responsavel} onChange={e => setFilters({...filters, responsavel: e.target.value})}>
              <option value="">Todos</option>
              {responsaveisList.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>

          <div className="filter-group">
            <label>Idade</label>
            <select className="filter-select" value={filters.ordenarPor} onChange={e => setFilters({...filters, ordenarPor: e.target.value})}>
              <option value="nomeAsc">Padrão</option>
              <option value="idadeAsc">Mais Novo</option>
              <option value="idadeDesc">Mais Velho</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Resultados</label>
            <div style={{ background: 'rgba(59, 130, 246, 0.2)', border: '1px solid var(--primary-color)', color: 'var(--text-primary)', padding: '0.6rem', borderRadius: '6px', fontSize: '0.9rem', fontWeight: '600', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              {filteredStudents.length} {filteredStudents.length === 1 ? 'Aluno' : 'Alunos'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '1.5rem', marginTop: '1rem' }}>
          <button 
            className="btn" 
            style={{ backgroundColor: 'var(--success-color)', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem', fontWeight: 'bold' }}
            onClick={exportToCSV}
            title="Baixar planilha com os alunos listados abaixo"
          >
            <i className="fas fa-file-excel"></i> Exportar CSV (Excel)
          </button>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th style={{ width: '30px', minWidth: '30px', maxWidth: '30px', textAlign: 'center', padding: '0' }}>#</th>
                <th>Nome</th>
                <th>Gênero</th>
                <th>CPF</th>
                <th>Turma</th>
                <th>Idade</th>
                <th>Situação</th>
                <th>Responsável</th>
                <th>Observações</th>
              </tr>
            </thead>
            <tbody>
              {/* LINHA DE NOVO ALUNO */}
              {!isAddingNew ? (
                <tr 
                  style={{ backgroundColor: 'rgba(59, 130, 246, 0.05)', borderBottom: '2px solid var(--primary-color)', cursor: 'pointer', transition: 'all 0.2s' }} 
                  onClick={() => setIsAddingNew(true)}
                >
                  <td colSpan="9" style={{ padding: '1rem', color: 'var(--primary-color)', fontWeight: '600', textAlign: 'center' }}>
                    + Adicionar Novo Aluno
                  </td>
                </tr>
              ) : (
                <>
                <tr style={{ backgroundColor: 'rgba(59, 130, 246, 0.05)' }} title="Pressione ENTER para salvar ou ESC para cancelar">
                  <td style={{ width: '30px', minWidth: '30px', maxWidth: '30px', textAlign: 'center', color: 'var(--text-secondary)', padding: '0' }}>-</td>
                  <td>
                    <input autoFocus type="text" className="inline-edit-input" placeholder="Digite o nome..." value={formData.nome} onChange={e => setFormData({...formData, nome: e.target.value})} onKeyDown={handleNewRowKeyDown} />
                  </td>
                <td>
                  <select className="inline-edit-input" value={formData.genero} onChange={e => setFormData({...formData, genero: e.target.value})} onKeyDown={handleNewRowKeyDown}>
                    <option value="MULHER">MULHER</option>
                    <option value="HOMEM">HOMEM</option>
                    <option value="OUTRO">OUTRO</option>
                  </select>
                </td>
                <td>
                  <input type="text" className="inline-edit-input" placeholder="CPF..." value={formData.cpf} onChange={e => setFormData({...formData, cpf: e.target.value})} onKeyDown={handleNewRowKeyDown} />
                </td>
                <td>
                  <select className="inline-edit-input" value={formData.turma} onChange={e => setFormData({...formData, turma: e.target.value})} onKeyDown={handleNewRowKeyDown}>
                    <option value="Manhã">Manhã</option>
                    <option value="Tarde">Tarde</option>
                  </select>
                </td>
                <td>
                  <input type="text" className="inline-edit-input" placeholder="Idade..." value={formData.idade} onChange={e => setFormData({...formData, idade: e.target.value})} onKeyDown={handleNewRowKeyDown} />
                </td>
                <td>
                  <select className="inline-edit-input" value={formData.situacao} onChange={e => setFormData({...formData, situacao: e.target.value})} onKeyDown={handleNewRowKeyDown}>
                    <option value="MATRICULADO">MATRICULADO</option>
                    <option value="DESISTENTE">DESISTENTE</option>
                    <option value="ELIMINADO">ELIMINADO</option>
                    <option value="REPROVADO">REPROVADO</option>
                    <option value="ASSINAR TERMO">ASSINAR TERMO</option>
                    <option value="DOCS PENDENTES">DOCS PENDENTES</option>
                  </select>
                </td>
                <td>
                  <select className="inline-edit-input" value={formData.responsavel} onChange={e => setFormData({...formData, responsavel: e.target.value})} onKeyDown={handleNewRowKeyDown}>
                    <option value="">Selecione...</option>
                    {responsaveisList.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </td>
                <td>
                  <input type="text" className="inline-edit-input" placeholder="Observações..." value={formData.observacoes} onChange={e => setFormData({...formData, observacoes: e.target.value})} onKeyDown={handleNewRowKeyDown} />
                </td>
              </tr>
              <tr style={{ backgroundColor: 'rgba(59, 130, 246, 0.05)', borderBottom: '2px solid var(--primary-color)' }}>
                <td colSpan="9" style={{ padding: '0.75rem 1rem' }}>
                  <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                    <button 
                      className="btn" 
                      style={{ padding: '0.5rem 1.5rem', backgroundColor: 'var(--danger-color)', width: 'auto' }}
                      onClick={() => { setIsAddingNew(false); setFormData(initialFormData); }}
                      title="Cancelar cadastro"
                    >
                      CANCELAR
                    </button>
                    <button 
                      className="btn" 
                      style={{ padding: '0.5rem 2rem', backgroundColor: 'var(--success-color)', width: 'auto' }}
                      onClick={handleSaveNovo}
                      title="Salvar cadastro"
                    >
                      SALVAR ALUNO
                    </button>
                  </div>
                </td>
              </tr>
              </>
              )}

              {/* LISTA DE ALUNOS EXISTENTES */}
              {filteredStudents.length > 0 ? filteredStudents.map((student, index) => (
                <tr 
                  key={student.id} 
                  style={{ backgroundColor: ROW_COLORS[student.situacao] || 'transparent' }}
                  onContextMenu={(e) => handleContextMenu(e, student)}
                >
                  <td style={{ width: '30px', minWidth: '30px', maxWidth: '30px', textAlign: 'center', fontWeight: 'bold', color: 'var(--text-secondary)', padding: '0' }}>{index + 1}</td>
                  <td>{renderCell(student, 'nome')}</td>
                  <td>{renderCell(student, 'genero', 'select', ['MULHER', 'HOMEM', 'OUTRO'])}</td>
                  <td>{renderCell(student, 'cpf')}</td>
                  <td>{renderCell(student, 'turma', 'select', ['Manhã', 'Tarde'])}</td>
                  <td>{renderCell(student, 'idade')}</td>
                  <td>{renderCell(student, 'situacao', 'select', ['MATRICULADO', 'DESISTENTE', 'ELIMINADO', 'REPROVADO', 'ASSINAR TERMO', 'DOCS PENDENTES'])}</td>
                  <td>{renderCell(student, 'responsavel', 'select', ['', ...responsaveisList])}</td>
                  <td style={{ whiteSpace: 'normal', wordBreak: 'break-word', minWidth: '200px', maxWidth: '350px' }}>{renderCell(student, 'observacoes')}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="9" style={{textAlign: 'center', padding: '2rem'}}>Nenhum aluno encontrado com esses filtros.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Menu de Contexto */}
      {contextMenu.visible && (
        <div 
          className="context-menu" 
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button 
            className="context-menu-item danger" 
            onClick={() => handleDeleteStudent(contextMenu.student)}
          >
            <i className="fas fa-trash-alt"></i> Excluir Aluno
          </button>
        </div>
      )}

      {/* Toast de Feedback de Cópia */}
      {copiedMsg && (
        <div style={{ 
          position: 'fixed', 
          bottom: '30px', 
          right: '30px', 
          backgroundColor: 'var(--success-color)', 
          color: 'white', 
          padding: '1rem 1.5rem', 
          borderRadius: '8px', 
          zIndex: 1000, 
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)', 
          fontWeight: '600',
          animation: 'slideDown 0.3s ease-out'
        }}>
          {copiedMsg}
        </div>
      )}

      {/* Modal de Configurações */}
      {isSettingsOpen && (
        <div className="modal-overlay" onClick={() => setIsSettingsOpen(false)}>
          <div className="glass-panel modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between' }}>
              Definir Responsáveis
              <button className="filter-btn" onClick={() => setIsSettingsOpen(false)}>X</button>
            </h2>
            
            <form onSubmit={handleAddResponsavel} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <input 
                type="text" 
                className="inline-edit-input" 
                placeholder="Novo Responsável..." 
                value={newResponsavel} 
                onChange={e => setNewResponsavel(e.target.value)} 
                autoFocus
              />
              <button type="submit" className="btn" style={{ whiteSpace: 'nowrap' }}>+ Adicionar</button>
            </form>

            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              {responsaveisList.length > 0 ? (
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {responsaveisList.map(resp => (
                    <li key={resp} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <strong>{resp}</strong>
                      <button 
                        className="btn" 
                        style={{ padding: '0.25rem 0.5rem', backgroundColor: 'var(--danger-color)', fontSize: '0.75rem', width: 'auto' }}
                        onClick={() => handleRemoveResponsavel(resp)}
                      >
                        Excluir
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>Nenhum responsável cadastrado.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

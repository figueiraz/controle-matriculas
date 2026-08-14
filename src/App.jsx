import { useState, useMemo, useEffect, useRef } from 'react';
import { collection, addDoc, updateDoc, doc, onSnapshot, setDoc, deleteDoc } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { db, auth } from './firebase';
import { STATUS_COLORS, ROW_COLORS } from './mockData';
import Login from './Login';

const MultiSelectDropdown = ({ label, options, selected, onChange, iconNode, placeholder = "Todas" }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="filter-group" style={{ position: 'relative' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        {label}
        {iconNode}
      </label>
      <div 
        className="filter-select" 
        style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected.length === 0 ? placeholder : 
           selected.length === 1 ? (options.find(o => (o.value || o) === selected[0])?.label || selected[0]) : 
           `${selected.length} selecionadas`}
        </span>
        <i className={`fas fa-chevron-${isOpen ? 'up' : 'down'}`} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}></i>
      </div>
      
      {isOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setIsOpen(false)}></div>
          <div style={{ 
            position: 'absolute', 
            top: '100%', left: 0, width: '100%', 
            background: '#1e293b', 
            border: '1px solid var(--border-color)', 
            borderRadius: '8px', 
            marginTop: '0.5rem', 
            zIndex: 50,
            boxShadow: '0 8px 25px rgba(0,0,0,0.5)',
            display: 'flex', flexDirection: 'column',
            padding: '0.5rem 0'
          }}>
            {options.map(opt => {
              const val = opt.value !== undefined ? opt.value : opt;
              const lbl = opt.label !== undefined ? opt.label : opt;
              return (
                <label key={val} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.7rem 1rem', cursor: 'pointer', transition: 'background 0.2s', margin: 0, textTransform: 'none', fontWeight: '500', fontSize: '0.9rem', color: 'var(--text-primary)' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                  <input 
                    type="checkbox" 
                    checked={selected.includes(val)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        onChange([...selected, val]);
                      } else {
                        onChange(selected.filter(s => s !== val));
                      }
                    }}
                    style={{ accentColor: 'var(--primary-color)', width: '1.2rem', height: '1.2rem', cursor: 'pointer' }}
                  />
                  {lbl}
                </label>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [students, setStudents] = useState([]);
  const [responsaveisList, setResponsaveisList] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  
  // Configurações
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [newResponsavel, setNewResponsavel] = useState('');
  const [isIdadeModalOpen, setIsIdadeModalOpen] = useState(false);

  // Filtros Avançados
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    turma: [],
    situacao: [], 
    genero: [],
    responsavel: [],
    ordenarPor: []
  });
  
  // Estado para a linha de Novo Aluno
  const initialFormData = {
    nome: '', telefone: '', genero: 'MULHER', cpf: '', turma: 'Manhã', idade: '', responsavel: '', situacao: 'MATRICULADO', observacoes: ''
  };
  const [formData, setFormData] = useState(initialFormData);
  const [isAddingNew, setIsAddingNew] = useState(false);

  // Estado para edição inline
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [copiedMsg, setCopiedMsg] = useState('');

  // Estado para menu de contexto (Exclusão)
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, student: null });

  // Referência para rolagem suave
  const filtersRef = useRef(null);

  const handleCardClick = (filterUpdates) => {
    setFilters(prev => ({ ...prev, ...filterUpdates }));
    if (filtersRef.current) {
      filtersRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

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
      
      const matchesTurma = filters.turma.length === 0 || filters.turma.includes(student.turma);
      
      const matchesSituacao = filters.situacao.length === 0 || filters.situacao.includes(student.situacao);
      
      const matchesGenero = filters.genero.length === 0 || filters.genero.includes(student.genero);
      
      const matchesResponsavel = filters.responsavel.length === 0 || filters.responsavel.includes(student.responsavel);

      let matchesIdadeFiltro = true;
      if (filters.ordenarPor.includes('menor18') && filters.ordenarPor.includes('maior18')) {
        matchesIdadeFiltro = true;
      } else if (filters.ordenarPor.includes('menor18')) {
        const idade = parseInt(student.idade);
        matchesIdadeFiltro = !isNaN(idade) && idade < 18;
      } else if (filters.ordenarPor.includes('maior18')) {
        const idade = parseInt(student.idade);
        matchesIdadeFiltro = !isNaN(idade) && idade >= 18;
      }

      return matchesSearch && matchesTurma && matchesSituacao && matchesGenero && matchesResponsavel && matchesIdadeFiltro;
    });

    result.sort((a, b) => {
      const orderOpt = filters.ordenarPor.find(o => ['nomeAsc', 'idadeAsc', 'idadeDesc'].includes(o)) || 'nomeAsc';
      if (orderOpt === 'nomeAsc') {
        return a.nome.localeCompare(b.nome);
      } 
      else if (orderOpt === 'idadeAsc' || orderOpt === 'idadeDesc') {
        const idadeA = parseInt(a.idade) || (orderOpt === 'idadeAsc' ? 999 : -1);
        const idadeB = parseInt(b.idade) || (orderOpt === 'idadeAsc' ? 999 : -1);
        
        if (orderOpt === 'idadeAsc') {
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
      total: students.filter(s => s.situacao !== 'DESISTENTE' && s.situacao !== 'ELIMINADO').length,
      manha: students.filter(s => s.turma === 'Manhã').length,
      tarde: students.filter(s => s.turma === 'Tarde').length,
      desistentes: students.filter(s => s.situacao === 'DESISTENTE' || s.situacao === 'ELIMINADO').length,
      matriculados: students.filter(s => s.situacao === 'MATRICULADO').length,
      docsPendentes: students.filter(s => s.situacao === 'DOCS PENDENTES').length,
      assinarTermo: students.filter(s => s.situacao === 'ASSINAR TERMO').length,
    };
  }, [students]);

  const ageStats = useMemo(() => {
    const matriculadosManha = students.filter(s => s.situacao === 'MATRICULADO' && s.turma === 'Manhã' && !isNaN(parseInt(s.idade)));
    const matriculadosTarde = students.filter(s => s.situacao === 'MATRICULADO' && s.turma === 'Tarde' && !isNaN(parseInt(s.idade)));

    const avgManha = matriculadosManha.length > 0 
      ? Math.round(matriculadosManha.reduce((acc, curr) => acc + parseInt(curr.idade), 0) / matriculadosManha.length) 
      : 0;
      
    const avgTarde = matriculadosTarde.length > 0 
      ? Math.round(matriculadosTarde.reduce((acc, curr) => acc + parseInt(curr.idade), 0) / matriculadosTarde.length) 
      : 0;

    return { avgManha, avgTarde };
  }, [students]);

  const exportToCSV = () => {
    if (filteredStudents.length === 0) {
      alert("Nenhum aluno para exportar.");
      return;
    }

    const headers = ["Nome", "Telefone", "Sexo", "CPF", "Turma", "Idade", "Situação", "Responsável", "Observações"];
    
    const escapeCsv = (str) => {
      if (!str) return '""';
      const safeStr = String(str).replace(/"/g, '""');
      return `"${safeStr}"`;
    };

    const rows = filteredStudents.map(student => [
      escapeCsv(student.nome),
      escapeCsv(student.telefone),
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
    
    const isCopyField = field === 'nome' || field === 'cpf' || field === 'telefone';
    
    const handleCellClick = () => {
      if (isCopyField) {
        if (student[field]) {
          navigator.clipboard.writeText(student[field]);
          setCopiedMsg(`${field === 'nome' ? 'Nome' : field === 'telefone' ? 'Telefone' : 'CPF'} copiado: ${student[field]}`);
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
        style={field === 'telefone' ? { display: 'flex', alignItems: 'center', gap: '0.5rem' } : {}}
      >
        {field === 'telefone' && displayValue !== '-' && (
          <a 
            href={`https://wa.me/55${String(displayValue).replace(/\D/g, '')}`} 
            target="_blank" 
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{ color: '#25D366', fontSize: '1.2rem', display: 'flex', alignItems: 'center', textDecoration: 'none' }}
            title="Abrir WhatsApp Web"
          >
            <i className="fab fa-whatsapp"></i>
          </a>
        )}
        {field === 'nome' ? <strong>{displayValue}</strong> : <span>{displayValue}</span>}
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
          <img src="/logo-percorre.svg" alt="Instituto Percorre" style={{ height: '40px', marginBottom: '0.5rem' }} />
          <h1>Painel de Matrículas</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.2rem', fontSize: '1.1rem', letterSpacing: '0.05em' }}>Unidade POA</p>
        </div>
        <div className="header-actions" style={{ position: 'relative' }}>
          {onlineUsers.length > 0 && (
            <div style={{ position: 'absolute', bottom: '100%', right: 0, marginBottom: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', background: 'rgba(16, 185, 129, 0.1)', padding: '0.4rem 0.8rem', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.3)', whiteSpace: 'nowrap', zIndex: 10 }}>
              {onlineUsers.map(u => (
                <div key={u.uid} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'flex-end' }}>
                  <span style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                    <span style={{ width: '8px', height: '8px', backgroundColor: '#10B981', borderRadius: '50%', boxShadow: '0 0 5px #10B981' }}></span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Online:</span>
                  </span>
                  <span style={{ fontSize: '0.8rem', color: '#10B981', fontWeight: '600' }} title={u.email}>
                    {u.email.split('@')[0]}
                  </span>
                </div>
              ))}
            </div>
          )}
          
          <div className="user-info-block">
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
        <div className="glass-panel stat-card" style={{ cursor: 'pointer' }} onClick={() => handleCardClick({ turma: [], situacao: [], genero: [], responsavel: [], ordenarPor: [] })}>
          <h3>Total em Andamento</h3>
          <span className="value">{stats.total}</span>
        </div>
        <div className="glass-panel stat-card" style={{ cursor: 'pointer' }} onClick={() => handleCardClick({ turma: ['Manhã'] })}>
          <h3>Turma Manhã</h3>
          <span className="value">{stats.manha}</span>
        </div>
        <div className="glass-panel stat-card" style={{ cursor: 'pointer' }} onClick={() => handleCardClick({ turma: ['Tarde'] })}>
          <h3>Turma Tarde</h3>
          <span className="value">{stats.tarde}</span>
        </div>
        <div className="glass-panel stat-card" style={{ cursor: 'pointer' }} onClick={() => handleCardClick({ situacao: ['MATRICULADO'] })}>
          <h3>Matriculados</h3>
          <span className="value" style={{color: 'var(--success-color)'}}>{stats.matriculados}</span>
        </div>
        <div className="glass-panel stat-card" style={{ cursor: 'pointer' }} onClick={() => handleCardClick({ situacao: ['DOCS PENDENTES'] })}>
          <h3>Docs Pendentes</h3>
          <span className="value" style={{color: 'var(--warning-color)'}}>{stats.docsPendentes}</span>
        </div>
        <div className="glass-panel stat-card" style={{ cursor: 'pointer' }} onClick={() => handleCardClick({ situacao: ['ASSINAR TERMO'] })}>
          <h3>Assinar Termo</h3>
          <span className="value" style={{color: 'var(--primary-color)'}}>{stats.assinarTermo}</span>
        </div>
        <div className="glass-panel stat-card" style={{ cursor: 'pointer' }} onClick={() => handleCardClick({ situacao: ['DESISTENTE', 'ELIMINADO'] })}>
          <h3>Desistentes e Eliminados</h3>
          <span className="value" style={{color: 'var(--danger-color)'}}>{stats.desistentes}</span>
        </div>
      </div>

      <div className="glass-panel" ref={filtersRef} style={{ scrollMarginTop: '2rem' }}>
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

        <div className="filters-panel" style={{ position: 'relative', zIndex: 20 }}>
          <MultiSelectDropdown 
            label="Turma" 
            options={['Manhã', 'Tarde']} 
            selected={filters.turma} 
            onChange={(val) => setFilters({...filters, turma: val})} 
          />
          
          <MultiSelectDropdown 
            label="Situação" 
            options={['MATRICULADO', 'DESISTENTE', 'ELIMINADO', 'ASSINAR TERMO', 'DOCS PENDENTES']} 
            selected={filters.situacao} 
            onChange={(val) => setFilters({...filters, situacao: val})} 
          />

          <MultiSelectDropdown 
            label="Sexo" 
            options={['MULHER', 'HOMEM', 'OUTRO']} 
            selected={filters.genero} 
            onChange={(val) => setFilters({...filters, genero: val})} 
          />

          <MultiSelectDropdown 
            label="Responsável" 
            options={responsaveisList} 
            selected={filters.responsavel} 
            onChange={(val) => setFilters({...filters, responsavel: val})} 
            iconNode={
              <button 
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}
                title="Editar Responsáveis"
              >
                <i className="fas fa-pencil-alt"></i>
              </button>
            }
          />

          <MultiSelectDropdown 
            label="Idade" 
            options={[
              { value: 'nomeAsc', label: 'Padrão' },
              { value: 'idadeAsc', label: 'Mais Novo' },
              { value: 'idadeDesc', label: 'Mais Velho' },
              { value: 'menor18', label: 'Menor de 18' },
              { value: 'maior18', label: 'Maior de 18' }
            ]} 
            selected={filters.ordenarPor} 
            onChange={(val) => setFilters({...filters, ordenarPor: val})} 
            iconNode={
              <button 
                type="button"
                onClick={() => setIsIdadeModalOpen(true)}
                style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', fontSize: '0.9rem', padding: 0 }}
                title="Ver média de idade"
              >
                <i className="fas fa-info-circle"></i>
              </button>
            }
          />

          <div className="filter-group">
            <label>Resultados</label>
            <div style={{ background: 'rgba(59, 130, 246, 0.2)', border: '1px solid var(--primary-color)', color: 'var(--text-primary)', padding: '0.6rem', borderRadius: '6px', fontSize: '0.9rem', fontWeight: '600', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              {filteredStudents.length} {filteredStudents.length === 1 ? 'Aluno' : 'Alunos'}
            </div>
          </div>

          <div className="filter-group">
            <label style={{ visibility: 'hidden' }}>Ação</label>
            <button 
              className="btn" 
              style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger-color)', border: '1px solid var(--danger-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.6rem 1rem', fontWeight: 'bold', borderRadius: '6px' }}
              onClick={() => {
                setSearchTerm('');
                setFilters({ turma: [], situacao: [], genero: [], responsavel: [], ordenarPor: [] });
              }}
              title="Remover todos os filtros e mostrar todos os alunos"
            >
              <i className="fas fa-eraser"></i> Limpar Filtros
            </button>
          </div>

          {/* FILTROS ATIVOS */}
          {(() => {
            const activeFilters = [];
            if (searchTerm) activeFilters.push(`Busca: ${searchTerm}`);
            if (filters.turma.length > 0) {
              filters.turma.forEach(t => activeFilters.push(`Turma: ${t}`));
            }
            if (filters.situacao.length > 0) {
              filters.situacao.forEach(sit => activeFilters.push(`Situação: ${sit}`));
            }
            if (filters.genero.length > 0) {
              filters.genero.forEach(g => activeFilters.push(`Sexo: ${g}`));
            }
            if (filters.responsavel.length > 0) {
              filters.responsavel.forEach(r => activeFilters.push(`Responsável: ${r}`));
            }
            if (filters.ordenarPor.length > 0) {
              filters.ordenarPor.forEach(o => {
                if (o === 'menor18') activeFilters.push(`Idade: Menor de 18`);
                if (o === 'maior18') activeFilters.push(`Idade: Maior de 18`);
                if (o === 'idadeAsc') activeFilters.push(`Ordem: Mais Novo`);
                if (o === 'idadeDesc') activeFilters.push(`Ordem: Mais Velho`);
                // Ignoramos o 'nomeAsc' por ser o Padrão
              });
            }

            if (activeFilters.length === 0) return null;

            return (
              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem', padding: '0.75rem 1rem', backgroundColor: 'rgba(59, 130, 246, 0.05)', borderRadius: '8px', border: '1px dashed rgba(59, 130, 246, 0.4)', alignItems: 'center' }}>
                <span style={{ color: 'var(--primary-color)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', marginRight: '0.5rem', fontWeight: '600' }}>
                  <i className="fas fa-filter" style={{ marginRight: '0.4rem' }}></i> Filtros Ativos:
                </span>
                {activeFilters.map((f, idx) => (
                  <div key={idx} style={{ backgroundColor: 'var(--primary-color)', color: 'white', padding: '0.3rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.4rem', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                    {f}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '1.5rem', marginTop: '1rem' }}>
          <button 
            className="btn" 
            style={{ backgroundColor: '#059669', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem', fontWeight: 'bold' }}
            onClick={exportToCSV}
            title="Baixar planilha com os alunos listados abaixo"
          >
            <i className="fas fa-file-excel"></i> Exportar CSV
          </button>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th style={{ width: '30px', minWidth: '30px', maxWidth: '30px', textAlign: 'center', padding: '0' }}>#</th>
                <th>Nome</th>
                <th>Telefone</th>
                <th>Sexo</th>
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
                  <td colSpan="10" style={{ padding: '1rem', color: 'var(--primary-color)', fontWeight: '600', textAlign: 'center' }}>
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
                    <input type="text" className="inline-edit-input" placeholder="Telefone..." value={formData.telefone} onChange={e => setFormData({...formData, telefone: e.target.value})} onKeyDown={handleNewRowKeyDown} />
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
                <td colSpan="10" style={{ padding: '0.75rem 1rem' }}>
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
                  <td style={{ whiteSpace: 'normal', wordBreak: 'break-word', minWidth: '150px', maxWidth: '250px' }}>{renderCell(student, 'nome')}</td>
                  <td>{renderCell(student, 'telefone')}</td>
                  <td>{renderCell(student, 'genero', 'select', ['MULHER', 'HOMEM', 'OUTRO'])}</td>
                  <td>{renderCell(student, 'cpf')}</td>
                  <td>{renderCell(student, 'turma', 'select', ['Manhã', 'Tarde'])}</td>
                  <td>{renderCell(student, 'idade')}</td>
                  <td>{renderCell(student, 'situacao', 'select', ['MATRICULADO', 'DESISTENTE', 'ELIMINADO', 'ASSINAR TERMO', 'DOCS PENDENTES'])}</td>
                  <td>{renderCell(student, 'responsavel', 'select', ['', ...responsaveisList])}</td>
                  <td style={{ whiteSpace: 'normal', wordBreak: 'break-word', minWidth: '200px', maxWidth: '350px' }}>{renderCell(student, 'observacoes')}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="10" style={{textAlign: 'center', padding: '2rem'}}>Nenhum aluno encontrado com esses filtros.</td>
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

      {/* Modal de Média de Idade */}
      {isIdadeModalOpen && (
        <div className="modal-overlay" onClick={() => setIsIdadeModalOpen(false)}>
          <div className="glass-panel modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between' }}>
              Média de Idade
              <button className="filter-btn" onClick={() => setIsIdadeModalOpen(false)}>X</button>
            </h2>
            
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.95rem', lineHeight: '1.5' }}>
              A média é calculada <strong>exclusivamente</strong> para os alunos com situação <strong>MATRICULADO</strong>.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <span style={{ fontWeight: '600', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <i className="fas fa-sun" style={{ color: '#FCD34D' }}></i> Turma Manhã
                </span>
                <span style={{ fontSize: '1.3rem', fontWeight: 'bold', color: 'var(--primary-color)' }}>
                  {ageStats.avgManha > 0 ? `${ageStats.avgManha} anos` : 'N/A'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <span style={{ fontWeight: '600', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <i className="fas fa-moon" style={{ color: '#9CA3AF' }}></i> Turma Tarde
                </span>
                <span style={{ fontSize: '1.3rem', fontWeight: 'bold', color: 'var(--primary-color)' }}>
                  {ageStats.avgTarde > 0 ? `${ageStats.avgTarde} anos` : 'N/A'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

export const initialStudents = [
  {
    id: '1',
    nome: 'Anna Carollina Da Silva Barcellos',
    genero: 'MULHER',
    cpf: '060.942.490-46',
    turma: 'Manhã',
    situacao: 'MATRICULADO',
    observacoes: 'Tudo certo'
  },
  {
    id: '2',
    nome: 'Carlos Daniel da Silva Damo',
    genero: 'H',
    cpf: '870.906.780-91',
    turma: 'Manhã',
    situacao: 'DOCS PENDENTES',
    observacoes: 'Falta RG'
  },
  {
    id: '3',
    nome: 'Dienifer Cristiny Ramos Dos Santos',
    genero: 'MULHER',
    cpf: '071.016.400-95',
    turma: 'Manhã',
    situacao: 'DESISTENTE',
    observacoes: 'Não tem mais interesse'
  },
  {
    id: '4',
    nome: 'Emanuel Renato Vidal de Oliveira',
    genero: 'H',
    cpf: '601.470.300-48',
    turma: 'Tarde',
    situacao: 'ASSINAR TERMO',
    observacoes: 'Indicação Marcos'
  },
  {
    id: '5',
    nome: 'Sol Guilloux Mazzarolo',
    genero: 'OUTRO',
    cpf: '601.818.160-67',
    turma: 'Manhã',
    situacao: 'MATRICULADO',
    observacoes: 'Tudo certo'
  },
  {
    id: '6',
    nome: 'Luiza Laurin Gonçalves Lourenço',
    genero: 'MULHER',
    cpf: '057.674.260-07',
    turma: 'Tarde',
    situacao: 'ELIMINADO',
    observacoes: 'Excedeu faltas'
  }
];

export const STATUS_COLORS = {
  'MATRICULADO': 'var(--success-color)',
  'DESISTENTE': 'var(--danger-color)',
  'ELIMINADO': 'var(--danger-color)',

  'ASSINAR TERMO': 'var(--primary-color)',
  'DOCS PENDENTES': 'var(--warning-color)'
};

export const ROW_COLORS = {
  'MATRICULADO': 'rgba(16, 185, 129, 0.15)',      // Verde
  'DOCS PENDENTES': 'rgba(245, 158, 11, 0.15)',   // Amarelo
  'DESISTENTE': 'rgba(239, 68, 68, 0.15)',        // Vermelho
  'ELIMINADO': 'rgba(239, 68, 68, 0.15)',         // Vermelho

  'ASSINAR TERMO': 'rgba(59, 130, 246, 0.15)'     // Azul
};

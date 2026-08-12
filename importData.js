import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc } from "firebase/firestore";
import fs from 'fs';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAm47FIzpDDHjMwq3vTap5t6XVG7DVohZ0",
  authDomain: "painel-matriculas.firebaseapp.com",
  projectId: "painel-matriculas",
  storageBucket: "painel-matriculas.firebasestorage.app",
  messagingSenderId: "446711543129",
  appId: "1:446711543129:web:dce30cd81ed3ce9ea90848",
  measurementId: "G-XK22B2MZDZ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const filePath = './planilhas-excel/planilha-painel-matriculas.csv';

const importData = async () => {
  console.log('Lendo arquivo CSV...');
  try {
    const fileContent = fs.readFileSync(filePath, 'latin1');
    const lines = fileContent.split('\n');
    
    let count = 0;

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      
      const cols = line.split(';');
      
      // Pular cabeçalhos ou linhas de separação de turma
      if (cols[1] === 'NOME' || cols[1] === undefined || cols[1].includes('Turma') || !cols[4]) {
        continue;
      }

      // Limpar aspas se houver
      const cleanCols = cols.map(c => c.replace(/^"|"$/g, '').trim());

      const situacaoRaw = cleanCols[6];
      let situacao = situacaoRaw;
      if (situacaoRaw === 'APROVADO') situacao = 'MATRICULADO';
      
      let turmaRaw = cleanCols[5];
      let turma = turmaRaw;
      if (turmaRaw.toLowerCase().includes('manh')) turma = 'Manhã';
      if (turmaRaw.toLowerCase().includes('tard')) turma = 'Tarde';

      const student = {
        nome: cleanCols[1] || '',
        genero: cleanCols[2] || 'OUTRO',
        idade: cleanCols[3] || '',
        cpf: cleanCols[4] || '',
        turma: turma || 'Manhã',
        situacao: situacao || 'MATRICULADO',
        responsavel: cleanCols[7] || '',
        observacoes: cleanCols[8] || ''
      };

      await addDoc(collection(db, "alunos"), student);
      console.log(`✅ Adicionado: ${student.nome}`);
      count++;
    }
    
    console.log(`\n🎉 Importação finalizada! ${count} alunos cadastrados com sucesso no Firebase.`);
    process.exit(0);
  } catch (error) {
    console.error('Erro na importação:', error);
    process.exit(1);
  }
};

importData();

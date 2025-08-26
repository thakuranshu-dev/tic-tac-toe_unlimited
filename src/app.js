// ------- Utilities -------
const lines = [ [0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6] ];
const empty = () => Array(9).fill(null);
const itemSelector = selector => document.querySelector(selector);
const itemsSelector = _selector => Array.from(document.querySelectorAll(_selector));

const LS = { // LocalStorage keys
  STATS: 'ttt-stats', 
  THEME:'ttt-theme', 
  MODE:'ttt-mode', 
  HUMAN:'ttt-human', 
  SFX:'ttt-sfx',
};
const load = (key, fallback) => { 
  try{ 
    const v = localStorage.getItem(key); 
    return v? JSON.parse(v) : fallback 
  }catch{ 
    return fallback 
  } 
};
const save = (key,value) => { 
  try{ 
    localStorage.setItem(key, JSON.stringify(value)) 
  }catch{
    console.warn(`Failed to save ${key} to localStorage`, value);
  } 
};

// ------- Game State -------
const state = {
  board: empty(),
  xIsNext: true,
  winner: null,
  history: [],
  stats: load(LS.STATS, {X:0, O:0, draws:0}),
  theme: load(LS.THEME, 'light'),
  mode: load(LS.MODE, 'cpu'),
  human: load(LS.HUMAN, 'X'),
  sfx: load(LS.SFX, true),
};

// -------SFX Audio -------
let audioCtx = null; // AudioContext for sound effects
function beep(freq=440, dur=.08, type='square', gain=.04){
  if(!state.sfx) return;
  try{
    if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator(); //sound generator
    const _gain = audioCtx.createGain(); //volume control
    oscillator.type = type; 
    oscillator.frequency.value = freq; 
    _gain.gain.value = gain; oscillator.connect(_gain); 
    _gain.connect(audioCtx.destination);
    const _time = audioCtx.currentTime; 
    oscillator.start(_time); 
    oscillator.stop(_time+dur);
  } catch (e) {
    console.warn('Web Audio API is not supported in this browser', e);
  }
}

// ------- Game logic -------
function winnerOf(board){
  for(const [a,b2,c] of lines){ 
    if(board[a] && board[a]===board[b2] && board[a]===board[c]) 
      return {
        player:board[a], 
        line:[a,b2,c]
      } 
  }
  if(board.every(Boolean)) 
    return {
      player:'draw', 
      line:[],
    };
  return null;
}

function moves(board){ 
  const result=[]; 
  for(let i=0;i<9;i++){
    if(!board[i]) 
      result.push(i); 
  }
  return result; 
}

function negamax(board, player, opp, alpha, beta, depth){
  const w = winnerOf(board);
  if(w){ 
    if(w.player===player) 
      return 10-depth; 
    if(w.player===opp) 
      return depth-10; 
    return 0;
  }
  let best = -Infinity;
  for(const i of moves(board)){
    board[i]=player; 
    const val = -negamax(board, opp, player, -beta, -alpha, depth+1); 
    board[i]=null;
    if(val>best) 
      best=val; 
    if(best>alpha) 
      alpha=best; 
    if(alpha>=beta) 
      break;
  }
  return best;
}

function bestMove(board, pc, human){
  const w = winnerOf(board); 
  if(w){ 
    if(w.player===pc) 
      return {score:10}; 
    if(w.player===human) 
      return {score:-10}; 
    return {score:0} 
  }
  
  let best={
    score:-Infinity, 
    index:null,
  };
  for(const i of moves(board)){
    board[i]=pc; 
    const s = -negamax(board, human, pc, -Infinity, Infinity, 0); 
    board[i]=null; 
    if(s>best.score) 
      best={score:s, index:i};
  }
  return best;
}

const cpuSymbol = () => (state.human === 'X' ? 'O' : 'X');

function ensureCpuTurn(delay = 350){
  if(!state.winner && state.mode==='cpu' && currentPlayer() !== state.human){
    setTimeout(() => {
      const mv = bestMove([...state.board], cpuSymbol(), state.human).index;
      if(mv != null) place(mv, true);
    }, delay);
  }
}

// ------- DOM refs -------
const app = itemSelector('#app');
const cells = itemsSelector('.cell');
const status = itemSelector('#status');
const subStatus = itemSelector('#substatus');
const btnNew = itemSelector('#newMatch');
const btnUndo = itemSelector('#undo');
const btnUndo2 = itemSelector('#undo2');
const btnAgain = itemSelector('#playAgain');
const btnSfx = itemSelector('#toggleSfx');
const selMode = itemSelector('#mode');
const wrapWho = itemSelector('#whoWrap');
const btnPlayX = itemSelector('#playX');
const btnPlayO = itemSelector('#playO');
const selTheme = itemSelector('#theme'); 
const xWins = itemSelector('#xWins');
const oWins = itemSelector('#oWins');
const draws = itemSelector('#draws');
const resetStats = itemSelector('#resetStats');

function setTheme(theme_id){ 
  app.setAttribute('data-theme', theme_id); 
  state.theme=theme_id; 
  save(LS.THEME,theme_id) 
}

function updateStatsUI(){ 
  xWins.textContent=state.stats.X; 
  oWins.textContent=state.stats.O; 
  draws.textContent=state.stats.draws ;
}

function render(){// board
  cells.forEach((cell,idx)=>{
    const v = state.board[idx];
    cell.textContent = v ? v : '';
    cell.classList.toggle('x', v==='X');
    cell.classList.toggle('o', v==='O');
    cell.classList.remove('win');
    cell.disabled = !!v || !!state.winner || (state.mode==='cpu' && currentPlayer()!==state.human);
    cell.setAttribute('aria-label', `Cell ${idx+1} ${v? v : 'empty'}`);
  });
  // highlight wins
  if(state.winner && state.winner.player!=='draw'){
  for(const i of state.winner.line){ cells[i].classList.add('win'); }
  }
  // status text
  if(state.winner){
    status.textContent = state.winner.player==='draw' ? "It's a draw!" : `${state.winner.player} wins!`;
    subStatus.textContent = '';
    btnAgain.style.display='inline-block';
  } else {
    status.textContent = `${currentPlayer()}'s turn`;
    subStatus.textContent = state.mode==='pvp' ? `Player ${currentPlayer()}` : (currentPlayer()===state.human? 'Your move' : 'CPU is thinking…');
    btnAgain.style.display='none';
  }
  // settings visibility
  wrapWho.style.display = state.mode==='cpu'? 'block':'none';
  // buttons
  btnUndo.disabled = state.history.length===0;
  btnUndo2.disabled = state.history.length===0;
  btnPlayX.classList.toggle('outline', state.human!=='X');
  btnPlayO.classList.toggle('outline', state.human!=='O');
  updateStatsUI();
}

function currentPlayer(){ 
  return state.xIsNext ? 'X' : 'O' 
}

function pushHistory(){ 
  state.history.push({ 
    board:[...state.board], 
    xIsNext: state.xIsNext }); 
}

function place(idx, byCPU=false){
  if(state.winner || state.board[idx]) 
    return;
  if(state.mode==='cpu' && !byCPU && currentPlayer()!==state.human) 
    return;

  pushHistory();
  state.board[idx] = currentPlayer();
  state.xIsNext = !state.xIsNext;
  beep(byCPU?420:500,.06,'square',.05);
  state.winner = winnerOf(state.board);
  if(state.winner){
    if(state.winner.player==='draw'){ 
      beep(300,.07,'sawtooth',.04); 
      state.stats.draws++; 
      save(LS.STATS, state.stats); 
    }else{ 
      beep(state.winner.player==='X'?660:520,.14,'triangle',.06); 
      state.stats[state.winner.player]++; 
      save(LS.STATS, state.stats); 
    }
  }
  render();
  // queue CPU move if needed
  /*
  if(!state.winner && state.mode==='cpu' && currentPlayer()!==state.human){
    setTimeout(()=>{
      const move = bestMove(
        [...state.board], 
        state.human==='X'? 'O':'X', 
        state.human
      ).index;
      if(move!=null) 
        place(move, true);
    }, 350);
  } */
  ensureCpuTurn(350);
}

function resetBoard(){ 
  state.board=empty(); 
  state.xIsNext=true; 
  state.winner=null; 
  state.history=[]; 
  beep(240,.05,'sine',.03); 
  render();
  ensureCpuTurn(120);
}

function undo(){
  if(state.history.length===0) 
    return;

  if(state.mode==='pvp'){ //player vs player
    const last = state.history.pop(); 
    state.board = last.board; 
    state.xIsNext = last.xIsNext; 
    state.winner = winnerOf(state.board); 
    beep(200,.05,'sine',.035);
  }else{ // player vs pc
    const steps = state.history.length>=2?2:1; 
    const target = state.history.splice(-steps)[0];
    state.board = target.board; 
    state.xIsNext = target.xIsNext; 
    state.winner = winnerOf(state.board); 
    beep(200,.05,'sine',.035);
  }
  render();
}

// ------- Wire up EventListeners-------
cells.forEach(
  _cell=> _cell.addEventListener(
    'click', e => place(
      +e.currentTarget.dataset.idx
    )
  ));

btnNew.addEventListener('click', resetBoard);
btnAgain.addEventListener('click', resetBoard);
btnUndo.addEventListener('click', undo);
btnUndo2.addEventListener('click', undo);
btnSfx.addEventListener('click', ()=>{ 
  state.sfx=!state.sfx; 
  save(LS.SFX,state.sfx); 
  btnSfx.textContent= state.sfx? '🔊 SFX':'🔇 SFX' ;
});

selMode.addEventListener('change', e=>{ 
  state.mode = e.target.value; 
  save(LS.MODE, state.mode); 
  resetBoard(); 
});

btnPlayX.addEventListener('click', ()=>{ 
  state.human='X'; 
  save(LS.HUMAN,'X'); 
  resetBoard(); 
});

btnPlayO.addEventListener('click', ()=>{ 
  state.human='O'; 
  save(LS.HUMAN,'O'); 
  resetBoard(); 
});

selTheme.addEventListener('change', e=> setTheme(e.target.value));

resetStats.addEventListener('click', ()=>{ 
  state.stats={X:0,O:0,draws:0}; 
  save(LS.STATS,state.stats); 
  updateStatsUI(); 
});

// ------- Init -------
// restore settings
app.setAttribute('data-theme', state.theme);
selTheme.value = state.theme;
selMode.value = state.mode;
btnSfx.textContent = state.sfx? '🔊 SFX':'🔇 SFX';

if(state.human==='X'){ 
  btnPlayX.classList.remove('outline'); 
  btnPlayO.classList.add('outline'); 
}else{ 
  btnPlayO.classList.remove('outline'); 
  btnPlayX.classList.add('outline'); 
}

updateStatsUI();
render();
ensureCpuTurn(120);
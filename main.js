//TODO: Add stack to bottom?

//Interface
let text;
let error_message;
let lines;
let highlighted;
let computer;
let needsUpdate = true;
function onLoad() {
    text = document.getElementById("code");
    error_message = document.getElementById("error");
    lines = document.getElementById("lines");
    highlighted = document.getElementById("highlighted");
    computer = new Machine();
    onResize();
    adjustLines();
    highlight();
}
function onResize() {
    highlighted.style.height = `${text.clientHeight}px`;
    highlighted.style.width = `${text.clientWidth}px`;
    lines.style.height = `${text.clientHeight}px`;
}
function compile() {
    if (needsUpdate === true) {
        computer.compile(text.value);
        needsUpdate = false;       
    }    
}
function update(mode) {
    try {
        compile();
        computer[mode]();
        error_message.innerText = "Error: none.";
        text.value = computer.toString();
    } catch(error) {
        error_message.innerHTML = `<span class="error">${error.name}</span>: ${error.message}.`;
        console.log(error);
    }
    adjustLines();
    highlight();
}
function onInput(event) {
    adjustLines();
    highlight();
    needsUpdate = true;
}
function onScroll(event) {
    lines.scrollTop = event.target.scrollTop;
    highlighted.scrollTop = event.target.scrollTop;
    highlighted.scrollLeft = event.target.scrollLeft;
}
function adjustLines() {
    const linenos = text.value.split('\n').length;
    const nos = [...Array(linenos).keys()];
    if (computer.counter < linenos) {
        nos[computer.counter] = '>' + computer.counter;
    }
    lines.innerText = nos.join('\n');
}
function highlight() {
    const highlights = [];
    for (const line of text.value.split('\n')) {
        var hline = "";
        for (let start = 0; start < line.length; start += match? match[0].length : 1) {
            for (const [type, regex] of Object.entries(HIGHLIGHTS)) {
                var match = regex.exec(line.slice(start));
                if (match !== null) {
                    hline += HIGHLIGHTER[type](match[0]);
                    break;
                }
            }
            if (match === null){
                hline += line[start];
            }
        }
        highlights.push(hline);
    }
    if (highlights[highlights.length-1] === "") { //Fixes a weird bug with the highlighting 
        highlights.push("");
    }
    highlighted.innerHTML = highlights.join("<br>");
}

//Tokener
class Token {
    constructor(type, value, match) {
        this.type = type;
        this.value = value;
        this.match = match;
    }
}
function lex(string) {
    const tokens = [];
    for (let start = 0; start < string.length; start += match? match[0].length : 1) {
        for (const [type, regexp] of Object.entries(LEXICON)) {
            var match = regexp.exec(string.slice(start));
            if (match !== null) {
                tokens.push(new Token(type, match[0], match));
                break;
            }
        }
    }
    tokens.push(new Token("eof", null, string.length));
    return tokens;
}

//Nodes
class Data {
    constructor(value) {
        this.value = value;
    }
    evaluate(machine) {
        return this.value;
    }
}
class Str extends Data {
    constructor(value) {
        super(value.slice(1, value.length-1));
    }
}
class Num extends Data {
    constructor(value) {
        super(Number(value));
    }
}
class Id extends Data {
    evaluate(machine) {
        return machine.environment[this.value];
    }
}
class Deref extends Data {
    evaluate(machine) {
        return machine.memory[this.value.evaluate(machine)];
    }
}
class Sum extends Data {
    constructor(left, right) {
        super(null);
        this.left = left;
        this.right = right;
    }
    evaluate(machine){
        return this.left.evaluate(machine) + this.right.evaluate(machine);
    }
}
class Instruction extends Data {
    constructor(value, condition, args) {
        super(value.toUpperCase());
        this.condition = condition !== undefined? condition.toUpperCase() : "AL";
        this.args = args;
    }
    evaluate(machine) {
        machine[this.value](...this.args.map(arg => arg.evaluate(machine)));
    }
    toString() {
        return this.original;
    }
}

//Parse
class Parser {
    parse(line) {
        this.tokens = lex(line);
        this.index = 0;
        return this.data();
    }
    next() {
        return this.tokens[this.index++];
    }
    peek(...symbols) {
        const token = this.tokens[this.index];
        return symbols.includes(token.type) || symbols.includes(token.value);
    }
    accept(...symbols) {
        if (this.peek(...symbols)) {
            return this.next();
        }
        return null;
    }
    expect(...symbols) {
        if (this.peek(...symbols)) {
            return this.next();
        }
        this.error();
        //throw new CompileError(`Expected ${symbol}, got "${this.tokens[this.index].value}"`);
    }
    error() {
        const token = this.tokens[this.index];
        throw new SyntaxError(`Unexpected ${token.type} token of value "${token.value}"`);
    }
    parseComment(s) {
        let q = null;
        for (const [i, c] of [...s].entries()) {
            if (q !== null) {
                if (c === q) {
                    q = null;
                }
            } else {
                if (c === COMMENT) {
                    let j = i;
                    while (j > 0 && /\s/.test(s[j-1])) {
                        j--;
                    }
                    return [s.slice(0, j), s.slice(j)];
                } else if (/'|"/.test(c)) {
                    q = c;
                }
            }
        }
        return [s, ""];
    }
    parseLabel(s) {
        let q = null;
        for (const [i, c] of [...s].entries()) {
            if (q !== null) {
                if (c === q) {
                    q = null;
                }
            } else {
                if (c === LABEL) {
                    let j = i;
                    while (j < s.length-1 && /\s/.test(s[j+1])) {
                        j++;
                    }
                    return [s.slice(0, j+1), s.slice(j+1)];
                } else if (/'|"/.test(c)) {
                    q = c;
                }
            }
        }
        return ["", s];
    }
    data() {
        /**
         * DATA = |str|num|keyword ARGS
         */
        if (this.accept("eof")) {
            return null;
        } else if (this.peek("str")) {
            let token = this.next();
            this.expect("eof");
            return token.value.slice(1, token.value.length-1);
        } else if (this.peek("num")) {
            let token = this.next();
            this.expect("eof");
            return Number(token.value);
        } else if (this.peek("keyword")) { 
            let token = this.next();           
            return new Instruction(token.match[1], token.match[2], this.args());
        } else {
            this.error();
        }
    }
    args() {
        /**
         * ARGUMENTS = [ARG {',' ARG}]
         */
        const args = [];
        if (this.peek("str","num","id",'[')) {
            args.push(this.arg());
            while (this.accept(',')) {
                args.push(this.arg());
            }
        }
        return args;
    }
    arg() {
        /**
         * ARGUMENT = str|SUM
         */
        if (this.peek("str")) {
            return new Str(this.next().value);
        } 
        return this.sum();        
    }
    sum() {
        /**
         * SUM = ADDRESS {'+' ADDRESS}
         */
        let sum = this.address();
        while (this.accept('+')) {
            sum = new Sum(sum, this.address());
        }
        return sum;
    }
    address() {
        /**
         * ADDRESS = num|id|'[' SUM ']'
         */
        let address;
        if (this.peek("num")) {
            address = new Num(this.next().value);
        } else if (this.peek("id")) {
            address = new Id(this.next().value);
        } else if (this.accept("[")) {
            address = new Deref(this.sum());
            this.expect("]");
        } else {
            this.error();
        }
        return address;
    }
}

//Machine
const COMMENT = '@';
const LABEL = ':';
const CODES = {
    AL: () => true,
    NV: () => false,
    EQ: (l, r) => l === r,
    NE: (l, r) => l !== r,
    GT: (l, r) => l > r,
    LT: (l, r) => l < r,
    GE: (l, r) => l >= r,
    LE: (l, r) => l <= r
};
function cmp(op1, op2) {
    return (op1 > op2) - (op1 < op2);
}
function cmn(op1, op2) {
    return (op1 > -op2) - (op1 < -op2);
}
function tst(op1, op2) {
    return op1 & op2;
}
function teq(op1, op2) {
    return (op1 > op2) ^ (op1 < op2);
}
function cat(op1, op2) {
    return op1.toString() + op2.toString();
}
function cast(op) {
    return Number(op);
}

class Machine {
    constructor() {
        this.memory = [];
        this.reset();

        this.comments = {};
        this.indices = {};
        this.labels = {};
        this.environment = {pc: this.counter};
    }
    toString() {
        const out = Array(this.memory.length).fill("");
        for (let i = 0; i < this.memory.length; i++) {
            out[i] += i in this.indices? this.indices[i] : "";
            if (typeof this.memory[i] === "string") {
                if (this.memory[i].length === 1) {
                    out[i] += `'${this.memory[i]}'`;
                } else {
                    out[i] += `"${this.memory[i]}"`;
                }                
            } else {
                out[i] += this.memory[i] !== null? this.memory[i].toString() : "";
            }
            out[i] += i in this.comments? this.comments[i] : "";
        }
        return out.join('\n');
    }
    compile(code) {
        this.memory = code.split('\n');
        const parser = new Parser();
        //Comment pass
        for (const [i, line] of this.memory.entries()) {
            let comment;
            [this.memory[i], comment] = parser.parseComment(line);
            if (comment !== "") {
                this.comments[i] = comment;
            }
        }
        //Label pass
        this.indices = {};
        this.labels = {};
        this.environment = {};
        for (const [i, line] of this.memory.entries()) {
            let label;
            [label, this.memory[i]] = parser.parseLabel(line);
            const name = label.replace(LABEL, "").trim();
            if (name !== "") {
                if (name in this.environment) {
                    throw new CompileError(`"${name}" is a reserved environment variable`);
                } else if (name in this.labels) {
                    throw new CompileError(`Duplicate label "${name}"`);
                } else if (this.hasOwnProperty(name.toUpperCase())) {
                    throw new CompileError(`"${name}" is a reserved keyword`);
                } else if (typeof this[name.toUpperCase()] === "function") {
                    throw new CompileError(`"${name}" is a reserved keyword`);
                }
                this.indices[i] = label;
                this.labels[name] = i;
            }
        }
        Object.assign(this.environment, this.labels);
        //Compile pass
        for (const [i, line] of this.memory.entries()) {
            const value = parser.parse(line);
            if (value instanceof Instruction) {
                value.original = line;
            }
            this.memory[i] = value;
        }
    }
    update() {
        this.environment.pc = this.counter;
    }
    reset() {
        this.counter = 0;
        this.flag = null;
        this.stack = [];
        this.calls = [];
    }
    next() {
        this.update();
        const data = this.memory[this.counter];
        if (data instanceof Instruction && CODES[data.condition](this.flag, 0)) {
            data.evaluate(this);
        } else {
            this.INC();
        }
    }
    run() {
        while (this.counter < this.memory.length) {
            this.next()
        }
    }
    binary(op, ...args) {
        if (args.length === 0) {
            const op2 = this.stack.pop();
            const op1 = this.stack.pop();
            this.PUSH(op(op1, op2));
        } else if (args.length === 2) {
            const [op1, op2] = args;
            this.MOVE(op(this.memory[op2], op1), op2);
        } else if (args.length === 3) {
            const [op1, op2, into] = args;
            this.MOVE(op(op1, op2), into);
        } else {
            throw new RuntimeError(`Binary instructions take 0, 2, or 3 argumments. Received ${args.length}`);
        }
    }
    unary(op, ...args) {
        if (args.length === 0) {
            this.PUSH(op(this.stack.pop()));
        } else if (args.length === 1) {
            const [op1] = args;
            this.MOVE(op(this.memory[op1]), op1);
        } else if (args.length === 2) {
            const [op1, into] = args;
            this.MOVE(op(op1), into);
        } else {
            throw new RuntimeError(`Unary instructions take 0, 1, or 2 arguments. Received ${args.length}`);
        }
    }
    compare(op, ...args) {
        if (args.length === 0) {
            const op2 = this.stack.pop();
            const op1 = this.stack.pop();
            this.flag = op(op1, op2);
        } else if (args.length === 2) {
            const [op1, op2] = args;
            this.flag = op(op1, op2);
        } else {
            throw new RuntimeError(`Comparison instructions take 0 or 2 arguments. Received ${args.length}`);
        }
        this.INC();
    }
    //Control
    INC() { this.counter++; }
    MOVE(value, into) {
        if (this.memory.length <= into && into < 1024) {
            this.memory = this.memory.concat(Array(into - this.memory.length + 1).fill(null));
        }
        this.memory[into] = value;
        this.INC();
    }
    JUMP(to) { this.counter = to; }
    CALL(to) {
        this.calls.push(this.counter + 1);
        this.JUMP(to);
    }
    RETURN() { this.JUMP(this.calls.length !== 0? this.calls.pop() : this.memory.length); }

    //Stack
    PUSH(...values) {
        for (const value of values) {
            this.stack.push(value);
        }
        this.INC();
    }
    POP(...intos) {
        for (const into of intos.reverse()) {
            this.memory[into] = this.stack.pop();
        }
        this.INC();
    }
    DROP() { 
        this.stack.pop();
        this.INC();
    }
    DUP() { this.PUSH(this.stack[this.stack.length-1]); }
    OVER() { this.PUSH(this.stack[this.stack.length-2]); }
    SWAP() { this.PUSH(...this.stack.splice(this.stack.length-2,1)); }

    //Unary
    NEG(...args) { this.unary(op1 => -op1, ...args); }
    INV(...args) { this.unary(op1 => ~op1, ...args); }
    NOT(...args) { this.unary(op1 => !op1, ...args); }
    CAST(...args) { this.unary(cast, ...args); }

    //Binary
    ADD(...args) { this.binary((op1, op2) => op1 + op2, ...args); }
    SUB(...args) { this.binary((op1, op2) => op1 - op2, ...args); }
    MUL(...args) { this.binary((op1, op2) => op1 * op2, ...args); }
    DIV(...args) { this.binary((op1, op2) => op1 / op2, ...args); }
    MOD(...args) { this.binary((op1, op2) => op1 % op2, ...args); }
    OR(...args)  { this.binary((op1, op2) => op1 | op2, ...args); }
    AND(...args) { this.binary((op1, op2) => op1 & op2, ...args); }
    XOR(...args) { this.binary((op1, op2) => op1 ^ op2, ...args); }
    LEFT(...args) { this.binary((op1, op2) => op1 << op2, ...args); }
    RIGHT(...args) { this.binary((op1, op2) => op1 >> op2, ...args); }
    CAT(...args) { this.binary(cat, ...args); }
    
    //Comparisons
    COMP(...args) { this.compare(cmp, ...args); }
    COMPN(...args) { this.compare(cmn, ...args); }
    TEST(...args) { this.binary(tst, ...args); }
    EQUIV(...args) { this.binary(teq, ...args); }

    MOVES(value, into) {
        if (this.memory.length <= into && into < 1024) {
            this.memory = this.memory.concat(Array(into - this.memory.length + 1).fill(null));
        }
        this.memory[into] = value;
        this.COMP(value, typeof value === "string"? "" : 0);
    }
    NEGS(value, into) { this.MOVES(-value, into); }
    INVS(value, into) { this.MOVES(~value, into); }
    NOTS(value, into) { this.MOVES(!value, into); }
    CASTS(value, into) { this.MOVES(cast(value), into); }
    ADDS(op1, op2, into) { this.MOVES(op1 + op2, into); }
    SUBS(op1, op2, into) { this.MOVES(op1 - op2, into); }
    MULS(op1, op2, into) { this.MOVES(op1 * op2, into); }
    DIVS(op1, op2, into) { this.MOVES(op1 / op2, into); }
    MODS(op1, op2, into) { this.MOVES(op1 % op2, into); }
    ORS(op1, op2, into) { this.MOVES(op1 | op2, into); }
    ANDS(op1, op2, into) { this.MOVES(op1 & op2, into); }
    XORS(op1, op2, into) { this.MOVES(op1 ^ op2, into); }
    LEFTS(op1, op2, into) { this.MOVES(op1 << op2, into); }
    RIGHTS(op1, op2, into) { this.MOVES(op1 >> op2, into); }
    CATS(op1, op2, into) { this.MOVES(cat(op1, op2), into); }
}

const LEXICON = {
    str: /^(('[^']*')|("[^"]*"))/,
    keyword: new RegExp(`^\\b(${Object.getOwnPropertyNames(Machine.prototype).filter(property => 
        Machine.prototype[property] instanceof Function && property === property.toUpperCase()
    ).join('|')})(${Object.keys(CODES).join('|')})?\\b`, 'i'),
    id: /^[a-z]\w*/i,
    num: /^-?((\d*\.\d+)|(\d+))/,
    comma: /^,/,
    plus: /^\+/,
    lbrace: /^\[/,
    rbrace: /^\]/,
    error: /^\S+/
};

const HIGHLIGHTS = {
    str: /^(('[^']*('|$))|("[^"]*("|$)))/,
    keyword: LEXICON.keyword,
    digit: /^\d+/,
    comment: new RegExp(`^${COMMENT}.*$`),
};

const HIGHLIGHTER = {
    str: match => `<span class="str">${match}</span>`,
    keyword: match => `<span class="keyword">${match}</span>`,
    digit: match => `<span class="digit">${match}</span>`,
    comment: match => `<span class="comment">${match}</span>`,
};

class CompileError extends Error {}
class RuntimeError extends Error {}
/*
push 6
call fact
pop 0
return
fact:
 dup
 push 0
 comp
 dropeq
 pusheq 1
 returneq
 dup
 push 1
 sub
 call fact
 mul
 return
 */
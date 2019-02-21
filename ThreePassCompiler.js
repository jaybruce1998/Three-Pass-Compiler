//This compiler takes code in the form [ x y z ] ( 2*3*x + 5*y - 3*z ) / (1 + 3 + 2*2)
//and translates it into two register assembler instructions by transforming it into an AST, simplifying constant values and then
//creating code in the following format:
/*
    "IM n"     // load the constant value n into R0
    "AR n"     // load the n-th input argument into R0
    "SW"       // swap R0 and R1
    "PU"       // push R0 onto the stack
    "PO"       // pop the top value off of the stack into R0
    "AD"       // add R1 to R0 and put the result in R0
    "SU"       // subtract R1 from R0 and put the result in R0
    "MU"       // multiply R0 by R1 and put the result in R0
    "DI"       // divide R0 by R1 and put the result in R0
*/
function Compiler () {};

Compiler.prototype.compile = function (program) {
  return this.pass3(this.pass2(this.pass1(program)));
};

Compiler.prototype.tokenize = function (program) {
  // Turn a program string into an array of tokens.  Each token
  // is either '[', ']', '(', ')', '+', '-', '*', '/', a variable
  // name or a number (as a string)
  var regex = /\s*([-+*/\(\)\[\]]|[A-Za-z]+|[0-9]+)\s*/g;
  return program.replace(regex, ":$1").substring(1).split(':').map( function (tok) {
    return isNaN(tok) ? tok : tok|0;
  });
};
//given some tokens, replace instances of the operations x and y with their appropriate AST nodes
function spliceAndDice(t, x, y)
{
  for(var i=1; i<t.length; i++)
    if(t[i]==x||t[i]==y)
    {
      var n=t.splice(--i, 3);//take out the tokens to multiply, divide, etc.
      t.splice(i, 0, {'op': n[1], 'a': n[0], 'b': n[2]});//and replace them in the token list with the AST node
    }
}
//given tokens, translate them into AST nodes
function operaSize(t)
{
  for(var i=0; i<t.length; i++)
    if(t[i]=="(")//find all parentheses
    {
      var j=i+1;
      for(var n=1; n; j++)//find the matching closing parenthesis
        if(t[j]=="(")
          n++;
        else if(t[j]==")")
          n--;
      j-=i+1;//we always go one past the index of the ) so adjust j for easier use in splice
      t.splice(i, 1, operaSize(t.splice(i+1, j).slice(0, j-1)));//splice in the AST representing whatever was in the parentheses
    }
  spliceAndDice(t, "*", '/');
  spliceAndDice(t, "+", '-');
  return t[0];//nodes gradually combine into one, so the entire AST will be here by the end of this
}
//given a program, convert it into a basic AST
Compiler.prototype.pass1 = function (program) {
  var t = this.tokenize(program), s=t.indexOf(']'), v=t.splice(0, s+1).slice(1, s);//remove the variable list and store it for easier parsing
  for(var i=0; i<t.length; i++)
    if(isNaN(t[i]))//either an arg or a PEMDAS operation
    {
      s=v.indexOf(t[i]);
      if(s>=0)//it's an arg
        t[i]={'op': 'arg', 'n': s};//so mark it as such
    }
    else//it's a constant (immmediate) value
      t[i]={'op': 'imm', 'n': t[i]};
  return operaSize(t);//finish parsing
};

Compiler.prototype.pass2 = function (ast) {
  if(ast['a']['a'])//there's a left subtree
    ast['a']=Compiler.prototype.pass2(ast['a']);//parse it and replace the left side
  if(ast['b']['a'])//there's a right subtree
    ast['b']=Compiler.prototype.pass2(ast['b']);
  if(ast['a']['op']=='imm'&&ast['b']['op']=='imm')//no subtrees at this point. Is it easy to simplify? (something like 3*4, 4+2, etc.)
    ast={'op': 'imm', 'n': eval(ast['a']['n']+ast['op']+ast['b']['n'])};//if so, use eval to simplify it to a constant value
  return ast;
};
function immArg(ast, r, l)
{
  if(ast[l]['op']=='imm')//immediate values are easy
    r.push("IM "+ast[l]['n']);
  else if(ast[l]['op']=='arg')//so are arguments (only other possibility is a subtree that's already been parsed, in which case ignore it
    r.push("AR "+ast[l]['n']);
  r.push("SW");//now do the same for the other subtree
}
Compiler.prototype.pass3 = function (ast) {
  var r=[];//represents all operations done so far
  if(ast['a']['a'])//there's a left subtree
    r=Compiler.prototype.pass3(ast['a']);//parse it seperately
  r.push("PU");//push the result of the left subtree to the stack so it doesn't get lost
  if(ast['b']['a'])
    r=r.concat(Compiler.prototype.pass3(ast['b']));//simplify the right subtree
  r.push("SW");//move the result of the right subtree to the second register
  r.push("PO");//pop the result of the left subtree
  immArg(ast, r, 'a');//simplify left immediate/argument value if it exists
  immArg(ast, r, 'b');//and do the right one, too
  r.push({"+": "AD", '-': "SU", "*": "MU", '/': "DI"}[ast['op']]);//replace basic operations as needed
  ast="RO";//shows that this subtree has been parsed already, don't parse it again!
  return r;//all commands run by this subtree will be concatenated to any existing supertrees
};
export function annotateBlameRuns(lines) {
  return lines.map((line, index) => ({
    ...line,
    startsRun: index === 0 || lines[index - 1].commit !== line.commit,
    shortHash: line.commit.slice(0, 7)
  }));
}

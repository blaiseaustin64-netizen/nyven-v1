import React from 'react'

export default function NyvenBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-nyven-bg">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-nyven-glow-blue/20 rounded-full blur-[120px]" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-nyven-glow-purple/20 rounded-full blur-[120px]" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-nyven-bg/50" />
    </div>
  )
}

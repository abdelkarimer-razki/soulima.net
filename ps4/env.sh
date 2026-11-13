#!/bin/bash
# Soulima PS4 Build Environment Setup
# Source this file before building: source env.sh

export OO_PS4_TOOLCHAIN="${HOME}/openorbis/OpenOrbis/PS4Toolchain"
export LLVM_BIN="${HOME}/local-llvm/bin"
export PATH="${OO_PS4_TOOLCHAIN}/bin:${OO_PS4_TOOLCHAIN}/bin/linux:${LLVM_BIN}:${PATH}"
export LD_LIBRARY_PATH="${OO_PS4_TOOLCHAIN}/lib/host:${OO_PS4_TOOLCHAIN}/bin/linux:${LD_LIBRARY_PATH}"
export DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1

echo "PS4 Toolchain Environment configured:"
echo "  OO_PS4_TOOLCHAIN : ${OO_PS4_TOOLCHAIN}"
echo "  Clang            : $(which clang 2>/dev/null)"
echo "  LLD              : $(which ld.lld 2>/dev/null)"
echo "  create-fself     : $(which create-fself 2>/dev/null)"
echo "  create-gp4       : $(which create-gp4 2>/dev/null)"
echo "  PkgTool.Core     : $(which PkgTool.Core 2>/dev/null)"

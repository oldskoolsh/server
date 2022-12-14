/*
 * Copyright 2020 Ricardo Pardini
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export interface IArch {
    id: string;
    other_names: string[];
    is_default: boolean
}

export class BaseArch {
    static createArch(arch: string): IArch {
        let allArches: IArch[] = [new archUnknown(), new archAmd64(), new archI386(), new archArm64(), new riscv64()];
        if (!arch) return allArches[0];

        let idMatch = allArches.filter(value => value.id === arch);
        if (idMatch.length != 1) {
            idMatch = allArches.filter(value => value.other_names.includes(arch));
            if (idMatch.length != 1) {
                console.warn(`Unknown Arch: '${arch}'`);
                return allArches[0];
            }
        }
        return idMatch[0];
    }
}

export class archUnknown extends BaseArch implements IArch {
    id: string = "unknown";
    other_names = ["other"]
    is_default = false;
}

export class archAmd64 extends BaseArch implements IArch {
    id: string = "amd64";
    other_names = ["x86_64"]
    is_default = true;
}

export class archI386 extends BaseArch implements IArch {
    id: string = "i386";
    other_names = ["x86", "x86_32"]
    is_default = true;
}

export class archArm64 extends BaseArch implements IArch {
    id: string = "arm64";
    other_names = ["aarch64", "armv8"]
    is_default = false;
}

export class riscv64 extends BaseArch implements IArch {
    id: string = "riscv64";
    other_names = []
    is_default = false;
}



class Repository extends Map<string, Repository> {
    constructor(public readonly name: string, public readonly path: string) {
        super();
    }

    add(backend: GitBackend) {
        this.set(backend.name, backend);
    }

    remove(backend: GitBackend) {
        this.delete(backend.name);
    }
}
import {RenderingContext} from "./context";
import {RepoResolver} from "../repo/resolver";
import {Recipe} from "../repo/recipe";

export class CloudInitRecipeListExpander {
    protected readonly context: RenderingContext;
    protected readonly repoResolver: RepoResolver;
    protected readonly initialRecipes: string[];
    protected explanations: string[];
    protected preExpandRecipes: string[];
    private expandedRecipes: string[];
    private availableRecipesMap!: Map<string, Recipe>;
    private availableRecipesArr!: Recipe[];

    constructor(context: RenderingContext, resolver: RepoResolver, initialRecipes: string[]) {
        this.context = context;
        this.repoResolver = resolver;
        this.initialRecipes = initialRecipes;
        this.preExpandRecipes = initialRecipes;
        this.expandedRecipes = initialRecipes;
        this.explanations = [];
    }

    async expand(): Promise<Recipe[]> {
        // get a full flat list of available recipes in the repo; those closest to root override those farthest away
        this.availableRecipesMap = await this.repoResolver.getFullFlatRecipeList();
        this.availableRecipesArr = [...this.availableRecipesMap.values()];
        await console.log("availableRecipes", this.availableRecipesArr.map(value => value.id));

        // iterate the available and evaluate expand_if and always_expand
        //   (against the initially specified list?)
        let auto_included: string[] = this.availableRecipesArr
            .filter(recipe => this.shouldAutoIncludeRecipe(recipe))
            .map(value => value.id);
        await console.log("auto_included", auto_included);

        // preExpandRecipes is initial plus the auto included
        this.preExpandRecipes.unshift(...auto_included);
        await console.log("After auto includes, ", this.initialRecipes);


        // pick the initially specified ones from the list and use that as starting point.
        //  (what if we can't find one?) throw!
        let pickedRecipes: Recipe[] = [];
        for (const initialRecipe of this.preExpandRecipes) {
            pickedRecipes.push(this.getRecipeById(initialRecipe));
        }

        // now each of those picked can 'expand' into more
        this.expandedRecipes = pickedRecipes.flatMap((recipe: Recipe) => this.expandRecipe(recipe));

        // hmm, then filters should kick in, by os or something else;
        await console.log("Final expanded recipes", this.expandedRecipes);

        await console.log("this.explanations", this.explanations);

        return this.expandedRecipes.map(recipe => this.getRecipeById(recipe));
    }

    private getRecipeById(initialRecipe: string) {
        return <Recipe>this.availableRecipesMap.get(initialRecipe);
    }

    private shouldAutoIncludeRecipe(recipe: Recipe): boolean {
        if (recipe.def.always_include) {
            this.explanations.push(`Recipe ${recipe.id} included because always_include!`);
            return true;
        }
        if (recipe.def.include_if_recipe) {
            if (recipe.def.include_if_recipe.some(if_yes => {
                return this.initialRecipes.some(initial_recipe => initial_recipe === if_yes)
            })) {
                this.explanations.push(`Recipe ${recipe.id} included because include_if_recipe!`);
                return true;
            }
        }
        if (recipe.def.include_if_not_recipe && (recipe.def.include_if_not_recipe.length > 0)) {
            if (recipe.def.include_if_not_recipe.every(if_not => {
                return !this.initialRecipes.some(initial_recipe => initial_recipe === if_not)
            })) {
                this.explanations.push(`Recipe ${recipe.id} included because include_if_not_recipe!`);
                return true;
            }
        }
        return false;
    }

    private expandRecipe(recipe: Recipe): string[] {
        let expanded = [];
        if (!recipe.def.virtual) expanded.push(recipe.id);
        if (recipe.def.expand) {
            for (const expansion of recipe.def.expand) {
                expanded.push(...this.expandRecipe(this.getRecipeById(expansion)));
            }
        }
        //console.log(`Recipe ${recipe.id} expanded to ${expanded}`);
        return expanded;
    }
}

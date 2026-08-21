import { Query, Resolver } from '@nestjs/graphql';

@Resolver()
export class AppResolver {
  @Query(() => String)
  health(): string {
    return 'EventCart GraphQL API is running!';
  }
}